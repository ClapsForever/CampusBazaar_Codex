import { resolve } from 'node:path';
import { normalizeDeliveryEmail } from './accounts.js';

export const DIRECT_MAIL_ENDPOINTS: Record<string, string> = {
  'cn-hangzhou': 'dm.aliyuncs.com',
  'ap-southeast-1': 'dm.ap-southeast-1.aliyuncs.com',
  'us-east-1': 'dm.us-east-1.aliyuncs.com',
  'eu-central-1': 'dm.eu-central-1.aliyuncs.com'
};

export interface MailConfig {
  regionId: string; endpoint: string; sender: string; senderName: string;
  credentialType: 'ecs_ram_role' | 'access_key'; roleName?: string;
  accessKeyId?: string; accessKeySecret?: string;
}

export interface Config {
  mode: 'local'; host: string; port: number; databasePath: string; uploadDir: string;
  publicBaseUrl: string; sessionSecret: string;
  agentBaseUrl: string; agentServiceToken: string; internalAgentToken: string; schoolId: string;
  mail?: MailConfig;
  emailSendDailyLimit?: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required configuration: ${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = required(env, 'APP_MODE');
  if (mode !== 'local') throw new Error('This API only supports APP_MODE=local');
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const host = env.HOST?.trim() || '127.0.0.1';
  const sessionSecret = required(env, 'SESSION_SECRET');
  if (sessionSecret.length < 32 || sessionSecret.startsWith('replace-')) throw new Error('SESSION_SECRET must be a random value of at least 32 characters');
  const agentServiceToken = required(env, 'AGENT_SERVICE_TOKEN');
  const internalAgentToken = required(env, 'INTERNAL_AGENT_TOKEN');
  if (agentServiceToken.startsWith('replace-') || internalAgentToken.startsWith('replace-') ||
    agentServiceToken.length < 24 || internalAgentToken.length < 24) throw new Error('Both service tokens must be random values of at least 24 characters');
  if (agentServiceToken === internalAgentToken) throw new Error('Agent service tokens must differ');
  const publicBaseUrl = required(env, 'PUBLIC_BASE_URL').replace(/\/$/, '');
  const agentBaseUrl = required(env, 'AGENT_BASE_URL').replace(/\/$/, '');
  for (const url of [publicBaseUrl, agentBaseUrl]) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid service URL');
  }
  const provider = env.EMAIL_PROVIDER?.trim() || 'disabled';
  if (!['disabled', 'aliyun'].includes(provider)) throw new Error('EMAIL_PROVIDER must be disabled or aliyun');
  let mail: MailConfig | undefined;
  if (provider === 'aliyun') {
    const publicUrl = new URL(publicBaseUrl);
    if (publicUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname)) {
      throw new Error('Email registration requires an HTTPS PUBLIC_BASE_URL (except loopback development)');
    }
    const regionId = required(env, 'ALIYUN_DM_REGION_ID');
    const endpoint = DIRECT_MAIL_ENDPOINTS[regionId];
    if (!endpoint) throw new Error('Unsupported ALIYUN_DM_REGION_ID; see the DirectMail configuration guide');
    const credentialType = env.ALIYUN_DM_CREDENTIAL_TYPE?.trim() || 'ecs_ram_role';
    if (credentialType !== 'ecs_ram_role' && credentialType !== 'access_key') throw new Error('Invalid ALIYUN_DM_CREDENTIAL_TYPE');
    const senderName = env.ALIYUN_DM_SENDER_NAME?.trim() || '同窗集';
    if ([...senderName].length >= 15 || /[\r\n]/.test(senderName)) throw new Error('Invalid ALIYUN_DM_SENDER_NAME');
    mail = { regionId, endpoint, sender: normalizeDeliveryEmail(required(env, 'ALIYUN_DM_SENDER')),
      senderName, credentialType, roleName: env.ALIYUN_DM_ROLE_NAME?.trim() || undefined };
    if (credentialType === 'access_key') {
      mail.accessKeyId = required(env, 'ALIBABA_CLOUD_ACCESS_KEY_ID');
      mail.accessKeySecret = required(env, 'ALIBABA_CLOUD_ACCESS_KEY_SECRET');
      if (mail.accessKeyId.startsWith('replace-') || mail.accessKeySecret.startsWith('replace-')) throw new Error('Replace mail credential placeholders');
    }
  }
  const emailSendDailyLimit = Number(env.EMAIL_SEND_DAILY_LIMIT ?? 200);
  if (!Number.isSafeInteger(emailSendDailyLimit) || emailSendDailyLimit < 1 || emailSendDailyLimit > 100_000) {
    throw new Error('EMAIL_SEND_DAILY_LIMIT must be an integer between 1 and 100000');
  }
  return {
    mode: 'local', host, port,
    databasePath: resolve(required(env, 'DATABASE_PATH')),
    uploadDir: resolve(required(env, 'UPLOAD_DIR')),
    publicBaseUrl, sessionSecret, agentBaseUrl, agentServiceToken, internalAgentToken,
    schoolId: env.AGENT_SCHOOL_ID?.trim() || 'school_demo', mail, emailSendDailyLimit
  };
}
