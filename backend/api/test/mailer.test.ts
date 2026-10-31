import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { loadConfig, type MailConfig } from '../src/config.js';
import { AliyunVerificationEmailSender, createVerificationEmailSender } from '../src/mailer.js';

const require = createRequire(import.meta.url);
const DirectMail = require('@alicloud/dm20151123') as typeof import('@alicloud/dm20151123');
const { $OpenApiUtil } = require('@alicloud/openapi-core') as typeof import('@alicloud/openapi-core');

const baseEnv = { APP_MODE: 'local', DATABASE_PATH: '/tmp/test-mail.sqlite', UPLOAD_DIR: '/tmp/test-mail-uploads',
  PUBLIC_BASE_URL: 'https://api.example.com', SESSION_SECRET: 'test-only-session-secret-at-least-32',
  AGENT_BASE_URL: 'http://127.0.0.1:3000', AGENT_SERVICE_TOKEN: 'a'.repeat(32), INTERNAL_AGENT_TOKEN: 'b'.repeat(32) };
const mail: MailConfig = { regionId: 'cn-hangzhou', endpoint: 'dm.aliyuncs.com', sender: 'noreply@notify.example.com',
  senderName: '同窗集', credentialType: 'access_key', accessKeyId: 'test-only-access-key', accessKeySecret: 'test-only-secret' };

test('默认关闭发信；启用阿里云需合法地域、单个发件地址、凭据和 HTTPS', () => {
  const disabled = loadConfig(baseEnv); assert.equal(disabled.mail, undefined); assert.equal(createVerificationEmailSender(disabled), undefined);
  const env = { ...baseEnv, EMAIL_PROVIDER: 'aliyun', ALIYUN_DM_REGION_ID: 'cn-hangzhou', ALIYUN_DM_SENDER: 'noreply@notify.example.com' };
  const role = loadConfig(env); assert.equal(role.mail!.credentialType, 'ecs_ram_role'); assert.equal(role.mail!.endpoint, 'dm.aliyuncs.com');
  assert.equal(role.mail!.senderName, '同窗集');
  assert(createVerificationEmailSender(role) instanceof AliyunVerificationEmailSender);
  for (const overrides of [
    { EMAIL_PROVIDER: 'mock' }, { ALIYUN_DM_REGION_ID: 'untrusted.example.com' },
    { ALIYUN_DM_SENDER: 'a,b@example.com' }, { ALIYUN_DM_SENDER_NAME: 'a\r\nb' },
    { ALIYUN_DM_CREDENTIAL_TYPE: 'access_key' }, { ALIYUN_DM_CREDENTIAL_TYPE: 'invalid' },
    { PUBLIC_BASE_URL: 'http://api.example.com' }, { EMAIL_SEND_DAILY_LIMIT: '0' }, { EMAIL_SEND_DAILY_LIMIT: '1.5' }
  ]) assert.throws(() => loadConfig({ ...env, ...overrides }));
  const keyed = loadConfig({ ...env, ALIYUN_DM_CREDENTIAL_TYPE: 'access_key',
    ALIBABA_CLOUD_ACCESS_KEY_ID: 'test-only-id', ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'test-only-secret' });
  assert.equal(keyed.mail!.accessKeyId, 'test-only-id'); assert.equal(keyed.emailSendDailyLimit, 200);
});

test('官方 SDK 真实 HTTP 序列化发送触发邮件，关闭追踪及自动重试', async () => {
  const received: { method: string | undefined; headers: import('node:http').IncomingHttpHeaders; parameters: URLSearchParams }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const part of req) chunks.push(Buffer.from(part));
    const url = new URL(req.url!, 'http://localhost');
    const parameters = new URLSearchParams(Buffer.concat(chunks).toString());
    for (const [key, value] of url.searchParams) parameters.set(key, value);
    received.push({ method: req.method, headers: req.headers, parameters });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"RequestId":"test-request-id","EnvId":"test-event"}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  try {
    // Only this injected local test client uses HTTP. The production factory pins HTTPS.
    const client = new DirectMail.default(new $OpenApiUtil.Config({ endpoint: `127.0.0.1:${address.port}`, protocol: 'HTTP',
      regionId: mail.regionId, accessKeyId: mail.accessKeyId, accessKeySecret: mail.accessKeySecret }));
    const sender = new AliyunVerificationEmailSender(mail, client);
    await sender.sendVerification({ email: 'receiver@example.com', code: '024680' });
    assert.equal(received.length, 1);
    const { method, parameters, headers } = received[0]!;
    assert.equal(method, 'POST');
    assert.equal(parameters.get('Action') ?? headers['x-acs-action'], 'SingleSendMail');
    assert.equal(parameters.get('AccountName'), mail.sender); assert.equal(parameters.get('ToAddress'), 'receiver@example.com');
    assert.equal(parameters.get('AddressType'), '1'); assert.equal(parameters.get('ReplyToAddress'), 'false');
    assert.equal(parameters.get('ClickTrace'), '0'); assert.match(parameters.get('TextBody')!, /024680/);
    assert.equal(parameters.get('FromAlias'), '同窗集');
    assert.equal(parameters.get('Subject'), '同窗集注册邮箱验证码');
    assert.match(parameters.get('TextBody')!, /您的同窗集注册验证码/);
    assert.match(parameters.get('TextBody')!, /5 分钟/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('供应商异常转成通用错误，日志不包含验证码、收件人、凭据和原始异常', async () => {
  const warnings: string[] = [], original = console.warn;
  console.warn = (value: unknown) => { warnings.push(String(value)); };
  try {
    const sender = new AliyunVerificationEmailSender(mail, { async singleSendMailWithOptions() {
      throw { code: 'InvalidMailAddress.NotFound', requestId: 'safe-request-id',
        message: 'receiver@example.com 024680 test-only-secret', data: { body: 'private provider request' } };
    } });
    await assert.rejects(sender.sendVerification({ email: 'receiver@example.com', code: '024680' }), {
      status: 503, code: 'EMAIL_DELIVERY_UNAVAILABLE', message: '邮件验证服务暂不可用，请稍后重试'
    });
    assert.equal(warnings.length, 1); assert.match(warnings[0]!, /InvalidMailAddress.NotFound/);
    for (const secret of ['receiver@example.com', '024680', 'test-only-secret', 'private provider request']) assert(!warnings.join('').includes(secret));
  } finally { console.warn = original; }
});
