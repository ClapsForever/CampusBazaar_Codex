import { createRequire } from 'node:module';
import type { Config, MailConfig } from './config.js';
import { ApiError } from './http.js';

// These official SDKs publish CommonJS. createRequire preserves their actual
// default constructor shape when this application runs as native Node ESM.
const require = createRequire(import.meta.url);
const DirectMail = require('@alicloud/dm20151123') as typeof import('@alicloud/dm20151123');
const { $OpenApiUtil } = require('@alicloud/openapi-core') as typeof import('@alicloud/openapi-core');
const Credentials = require('@alicloud/credentials') as typeof import('@alicloud/credentials');
const { RuntimeOptions } = require('@darabonba/typescript') as typeof import('@darabonba/typescript');

export interface VerificationEmail {
  email: string;
  code: string;
}

export interface VerificationEmailSender {
  sendVerification(message: VerificationEmail): Promise<void>;
}

export function mailUnavailable(): ApiError {
  return new ApiError(503, 'EMAIL_DELIVERY_UNAVAILABLE', '邮件验证服务暂不可用，请稍后重试', true);
}

type MailClient = Pick<import('@alicloud/dm20151123').default, 'singleSendMailWithOptions'>;

export class AliyunVerificationEmailSender implements VerificationEmailSender {
  private client: MailClient;

  constructor(private config: MailConfig, client?: MailClient) {
    const credential = new Credentials.default(new Credentials.Config(config.credentialType === 'ecs_ram_role'
      ? { type: 'ecs_ram_role', roleName: config.roleName, disableIMDSv1: true }
      : { type: 'access_key', accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret }));
    this.client = client ?? new DirectMail.default(new $OpenApiUtil.Config({
      regionId: config.regionId, endpoint: config.endpoint, protocol: 'HTTPS', credential,
      connectTimeout: 5_000, readTimeout: 10_000
    }));
  }

  async sendVerification({ email, code }: VerificationEmail): Promise<void> {
    try {
      const result = await this.client.singleSendMailWithOptions(new DirectMail.SingleSendMailRequest({
        accountName: this.config.sender, addressType: 1, replyToAddress: false,
        fromAlias: this.config.senderName, toAddress: email,
        subject: '同窗集注册邮箱验证码',
        textBody: `您的同窗集注册验证码为：${code}，5 分钟内有效。请勿向他人提供验证码。如非您本人操作，请忽略本邮件。`,
        clickTrace: '0'
      }), new RuntimeOptions({ autoretry: false, connectTimeout: 5_000, readTimeout: 10_000 }));
      if (result.statusCode !== 200 || !result.body?.requestId) throw mailUnavailable();
    } catch (error) {
      // SDK errors may contain request bodies or credentials. Never log the raw
      // error, body or stack. Only bounded provider identifiers are retained.
      const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
      const safe = (item: unknown): string | undefined => typeof item === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(item) ? item : undefined;
      console.warn(JSON.stringify({ event: 'email_delivery_failed', provider: 'aliyun',
        providerCode: safe(value.code), providerRequestId: safe(value.requestId) }));
      throw mailUnavailable();
    }
  }
}

export function createVerificationEmailSender(config: Config): VerificationEmailSender | undefined {
  return config.mail ? new AliyunVerificationEmailSender(config.mail) : undefined;
}
