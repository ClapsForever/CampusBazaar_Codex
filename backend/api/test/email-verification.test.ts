import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { provisionAccounts } from '../src/accounts.js';
import type { Config } from '../src/config.js';
import type { VerificationEmailSender } from '../src/mailer.js';
import { AGREEMENT_VERSION, PRIVACY_VERSION } from '../src/registration.js';
import { createApiApp } from '../src/server.js';
import { RecordingEmailSender } from './helpers/email.js';

async function fixture(sender: VerificationEmailSender | null = new RecordingEmailSender(), dailyLimit = 200) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-email-verification-'));
  const config: Config = { mode: 'local', host: '127.0.0.1', port: 0,
    databasePath: join(directory, 'db.sqlite'), uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'isolated-email-verification-test-secret', agentBaseUrl: 'http://127.0.0.1:1',
    agentServiceToken: 'test-agent-service-token-a', internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_test',
    emailSendDailyLimit: dailyLimit };
  let app = createApiApp(config, { emailSender: sender ?? undefined }), base = '';
  async function start() {
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address(); assert(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
  }
  await start();
  async function call(path: string, body: unknown, ip = '203.0.113.1') {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any, headers: response.headers };
  }
  const issue = (email = 'member@example.com', ip = '203.0.113.1') => call('/api/v1/auth/email-verifications', { email, purpose: 'register' }, ip);
  const register = (verificationId: unknown, code: unknown, overrides: Record<string, unknown> = {}) => call('/api/v1/auth/registrations', {
    email: 'member@example.com', password: 'Campus123', agreementVersion: AGREEMENT_VERSION, privacyVersion: PRIVACY_VERSION,
    emailVerificationId: verificationId, emailCode: code, ...overrides
  });
  return { config, sender: sender as RecordingEmailSender, call, issue, register, get db() { return app.db; },
    async restart() { await app.close(); app = createApiApp(config, { emailSender: sender ?? undefined }); await start(); },
    async close() { await app.close(); } };
}

test('未配置邮件服务时发码关闭，注册绝不回退到无验证码或固定验证码', async () => {
  // An explicit non-sending configuration; omit the injected test transport.
  const f = await fixture(null);
  try {
    assert.equal((await f.issue()).status, 503);
    const missing = await f.register(undefined, undefined);
    assert.equal(missing.status, 400); assert.equal(missing.body.code, 'EMAIL_VERIFICATION_REQUIRED');
    const forged = await f.register(`emailv_${'a'.repeat(32)}`, '123456');
    assert.equal(forged.status, 400); assert.equal(forged.body.code, 'EMAIL_CODE_INVALID');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 0);
  } finally { await f.close(); }
});

test('真实注册契约：匿名发码、摘要存储、重启后校验、自动登录和单次消费', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(' Member+Test@Example.COM ');
    assert.equal(issued.status, 202); assert.match(issued.body.verificationId, /^emailv_[a-f0-9]{32}$/);
    assert.equal(issued.body.expiresIn, 300); assert.equal(issued.body.resendAfter, 60);
    assert.equal(issued.headers.get('cache-control'), 'no-store'); assert(!('code' in issued.body));
    const code = f.sender.codeFor('member+test@example.com'); assert.match(code, /^\d{6}$/);
    const row = f.db.prepare('SELECT * FROM email_verifications').get()!;
    assert.match(String(row.code_hash), /^[a-f0-9]{64}$/); assert.notEqual(row.code_hash, code);
    assert.equal(row.email, 'member+test@example.com'); assert.equal(row.state, 'sent');
    assert(!('code' in row));
    const limits = f.db.prepare("SELECT key FROM email_verification_limits WHERE key!='*'").all();
    assert(limits.every(item => /^[a-f0-9]{64}$/.test(String(item.key))));
    await f.restart();
    const registered = await f.register(issued.body.verificationId, code, { email: ' MEMBER+TEST@EXAMPLE.COM ' });
    assert.equal(registered.status, 201); assert.equal(registered.body.user.emailVerified, true);
    const user = f.db.prepare('SELECT * FROM users').get()!;
    assert.equal(user.email_verified_at, user.created_at);
    assert.equal(f.db.prepare('SELECT state FROM email_verifications').get()!.state, 'consumed');
    assert.equal(f.db.prepare('SELECT code_hash FROM email_verifications').get()!.code_hash, '');
    assert.equal((await f.register(issued.body.verificationId, code, { email: 'other@example.com' })).status, 400);
    assert.equal((await f.register(issued.body.verificationId, code, { email: 'member+test@example.com' })).status, 409);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 1);
  } finally { await f.close(); }
});

test('错误猜测次数持久化，五次后正确码也不能使用；不同邮箱不能使用同一挑战', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(), id = issued.body.verificationId, code = f.sender.codeFor('member@example.com');
    assert.equal((await f.register(id, code, { email: 'other@example.com' })).status, 400);
    assert.equal(f.db.prepare('SELECT attempts FROM email_verifications').get()!.attempts, 0);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let n = 0; n < 3; n++) assert.equal((await f.register(id, wrong)).status, 400);
    await f.restart();
    for (let n = 0; n < 2; n++) assert.equal((await f.register(id, wrong)).status, 400);
    assert.equal(f.db.prepare('SELECT attempts FROM email_verifications').get()!.attempts, 5);
    assert.equal((await f.register(id, code)).status, 400);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 0);
  } finally { await f.close(); }
});

test('过期验证码被拒绝；重发立即替换旧挑战；成功注册不接受重放', async () => {
  const f = await fixture();
  try {
    const old = await f.issue(), oldCode = f.sender.codeFor('member@example.com');
    f.db.prepare('UPDATE email_verifications SET expires_at=1').run();
    assert.equal((await f.register(old.body.verificationId, oldCode)).status, 400);
    f.db.prepare("UPDATE email_verification_limits SET until_at=1 WHERE scope='email_cooldown'").run();
    const next = await f.issue(); assert.equal(next.status, 202); assert.notEqual(next.body.verificationId, old.body.verificationId);
    assert.equal((await f.register(old.body.verificationId, oldCode)).status, 400);
    assert.equal((await f.register(next.body.verificationId, f.sender.codeFor('member@example.com'))).status, 201);
  } finally { await f.close(); }
});

test('并发发码只发送一封，返回 Retry-After，重启不会重置冷却', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([f.issue(), f.issue('MEMBER@example.com')]);
    assert.deepEqual(results.map(item => item.status).sort(), [202, 429]); assert.equal(f.sender.messages.length, 1);
    const limited = results.find(item => item.status === 429)!;
    assert(Number(limited.headers.get('retry-after')) > 0); assert(Number(limited.body.retryAfter) <= 60);
    await f.restart(); assert.equal((await f.issue()).status, 429);
  } finally { await f.close(); }
});

test('全局日预算覆盖不同邮箱与来源并跨重启保存；发送失败仍消耗预算', async () => {
  const sender = new RecordingEmailSender(), f = await fixture(sender, 1);
  try {
    sender.fail = true; assert.equal((await f.issue()).status, 503);
    assert.equal(f.db.prepare('SELECT state FROM email_verifications').get()!.state, 'failed');
    assert.equal(f.db.prepare('SELECT code_hash FROM email_verifications').get()!.code_hash, '');
    await f.restart(); sender.fail = false;
    assert.equal((await f.issue('other@example.com', '203.0.113.2')).status, 429);
    assert.equal(sender.messages.length, 0);
  } finally { await f.close(); }
});

test('会话写入失败回滚验证码消费、账号、协议；恢复后同一码可以完成注册', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(), id = issued.body.verificationId, code = f.sender.codeFor('member@example.com');
    f.db.exec("CREATE TRIGGER reject_email_session BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
    assert.equal((await f.register(id, code)).status, 500);
    for (const table of ['users', 'auth_sessions', 'registration_consents']) assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0);
    assert.equal(f.db.prepare('SELECT state FROM email_verifications').get()!.state, 'sent');
    f.db.exec('DROP TRIGGER reject_email_session');
    const results = await Promise.all([f.register(id, code), f.register(id, code)]);
    assert.deepEqual(results.map(item => item.status).sort(), [201, 409]);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 1);
  } finally { await f.close(); }
});

test('收件人列表、头注入和非注册用途被拒绝，HTTP 不能注入测试传输或自选验证码', async () => {
  const f = await fixture();
  try {
    for (const email of ['a,b@example.com', 'a@example.com,b@example.net', 'a@example.com\r\nBcc:b@example.com',
      'Name<a@example.com>', 'a;other@example.com', 'a@-bad.example', '.a@example.com', 'a..b@example.com']) {
      assert.equal((await f.issue(email)).status, 400);
    }
    assert.equal((await f.call('/api/v1/auth/email-verifications', { email: 'member@example.com', purpose: 'reset-password' })).status, 400);
    const issued = await f.call('/api/v1/auth/email-verifications', { email: 'member@example.com', code: '123456', provider: 'mock' });
    assert.equal(issued.status, 202); assert.equal(f.sender.messages.length, 1);
    assert.equal(f.db.prepare('SELECT purpose FROM email_verifications').get()!.purpose, 'register');
  } finally { await f.close(); }
});

test('旧账号保持未验证与原密码，发码不会覆盖账号或泄露邮箱是否被注册', async () => {
  const f = await fixture();
  try {
    await provisionAccounts(f.db, f.config.schoolId, [{ email: 'member@example.com', password: 'OldPass123' }]);
    const before = f.db.prepare('SELECT * FROM users').get()!;
    const issued = await f.issue(); assert.equal(issued.status, 202); assert.match(issued.body.verificationId, /^emailv_/);
    assert.equal(f.sender.messages.length, 0); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM email_verifications').get()!.n, 0);
    assert.deepEqual(f.db.prepare('SELECT * FROM users').get(), before);
    const login = await f.call('/api/v1/auth/password/sessions', { email: 'member@example.com', password: 'OldPass123' });
    assert.equal(login.status, 201); assert.equal(login.body.user.emailVerified, false);
    assert.equal(f.db.prepare('SELECT email_verified_at FROM users').get()!.email_verified_at, null);
  } finally { await f.close(); }
});

test('旧发信请求迟到不会覆盖新验证码；sending 状态不能注册', { timeout: 10_000 }, async () => {
  const messages: { email: string; code: string }[] = [];
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const sender: VerificationEmailSender = { async sendVerification(message) {
    messages.push(message); if (messages.length === 1) await wait;
  } };
  const f = await fixture(sender);
  try {
    const pending = f.issue();
    // Wait for the real HTTP handler to enter the deliberately held transport.
    while (!messages.length) await new Promise(resolve => setImmediate(resolve));
    const first = f.db.prepare('SELECT id FROM email_verifications').get()!;
    assert.equal((await f.register(first.id, messages[0]!.code)).status, 400);
    f.db.prepare("UPDATE email_verification_limits SET until_at=1 WHERE scope='email_cooldown'").run();
    const next = await f.issue(); assert.equal(next.status, 202);
    release(); assert.equal((await pending).status, 503);
    assert.equal(f.db.prepare('SELECT id FROM email_verifications').get()!.id, next.body.verificationId);
    assert.equal(f.db.prepare('SELECT state FROM email_verifications').get()!.state, 'sent');
    assert.equal((await f.register(next.body.verificationId, messages[1]!.code)).status, 201);
  } finally { release(); await f.close(); }
});

test('重启清除过期验证码及限流，不清除有效挑战、账号或原会话', async () => {
  const f = await fixture();
  try {
    await f.issue('expired@example.com');
    const valid = await f.issue('valid@example.com');
    f.db.prepare("UPDATE email_verifications SET expires_at=1 WHERE email='expired@example.com'").run();
    f.db.prepare("UPDATE email_verification_limits SET until_at=1 WHERE scope='email_cooldown'").run();
    await f.restart();
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM email_verifications').get()!.n, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM email_verification_limits WHERE scope='email_cooldown'").get()!.n, 0);
    assert.equal((await f.register(valid.body.verificationId, f.sender.codeFor('valid@example.com'), { email: 'valid@example.com' })).status, 201);
  } finally { await f.close(); }
});

test('v5 升级 v6 保留旧账号、密码、会话和验证状态，重复打开幂等', async () => {
  const f = await fixture();
  try {
    await provisionAccounts(f.db, f.config.schoolId, [{ email: 'legacy@example.com', password: 'Legacy123' }]);
    const login = await f.call('/api/v1/auth/password/sessions', { email: 'legacy@example.com', password: 'Legacy123' });
    const user = f.db.prepare('SELECT * FROM users').get()!;
    const session = f.db.prepare('SELECT * FROM auth_sessions').get()!;
    f.db.exec('DROP TABLE email_verifications; DROP TABLE email_verification_limits; PRAGMA user_version=5;');
    for (let n = 0; n < 2; n++) {
      await f.restart();
      assert.equal(f.db.prepare('PRAGMA user_version').get()!.user_version, 6);
      assert.deepEqual(f.db.prepare('SELECT * FROM users').get(), user);
      assert.deepEqual(f.db.prepare('SELECT * FROM auth_sessions').get(), session);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM email_verifications').get()!.n, 0);
      assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
    }
    assert(login.body.token);
  } finally { await f.close(); }
});
