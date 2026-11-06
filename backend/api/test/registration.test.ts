import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { provisionAccounts } from '../src/accounts.js';
import type { Config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { tokenHash } from '../src/http.js';
import { AGREEMENT_VERSION, PRIVACY_VERSION, RegistrationProtection } from '../src/registration.js';
import { createApiApp } from '../src/server.js';
import { RecordingEmailSender } from './helpers/email.js';

function configFor(): Config {
  const directory = mkdtempSync(join(tmpdir(), 'campus-registration-'));
  return { mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(directory, 'db.sqlite'),
    uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'this-is-a-long-test-only-session-secret', agentBaseUrl: 'http://127.0.0.1:1',
    agentServiceToken: 'test-agent-service-token-a', internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_test' };
}

async function fixture() {
  const config = configFor();
  const sender = new RecordingEmailSender(), codes = new Map<string, { emailVerificationId: string; emailCode: string }>();
  let app = createApiApp(config, { emailSender: sender }), base = '';
  async function start() {
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address(); assert(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
  }
  await start();
  async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any, headers: response.headers };
  }
  const registration = async (overrides: Record<string, unknown> = {}, clientIp = '203.0.113.1') => {
    const email = String(overrides.email ?? ' New.Member+Test@Example.COM ').trim().toLowerCase();
    if (!codes.has(email)) {
      const sent = await call('/api/v1/auth/email-verifications', { email }, { 'x-real-ip': clientIp });
      if (sent.status === 202 && sender.messages.some(item => item.email === email)) {
        codes.set(email, { emailVerificationId: sent.body.verificationId, emailCode: sender.codeFor(email) });
      }
    }
    return call('/api/v1/auth/registrations', { email: ' New.Member+Test@Example.COM ', password: ' demo password ',
      agreementVersion: AGREEMENT_VERSION, privacyVersion: PRIVACY_VERSION, ...codes.get(email), ...overrides }, { 'x-real-ip': clientIp });
  };
  return { config, call, registration, get app() { return app; },
    async restart() { await app.close(); app = createApiApp(config, { emailSender: sender }); await start(); },
    async close() { await app.close(); } };
}

test('图形验证码接口保持关闭；邮箱验证码注册、密码登录和会话跨重启使用', async () => {
  const f = await fixture();
  try {
    for (const body of [{}, { previousId: 'old' }]) {
      const response = await f.call('/api/v1/auth/captchas', body);
      assert.equal(response.status, 404); assert.equal(response.body.code, 'NOT_FOUND');
    }
    assert.equal((await f.call('/api/v1/auth/captchas')).status, 404);
    assert.equal(f.app.db.prepare('SELECT COUNT(*) AS n FROM auth_captchas').get()!.n, 0);
    const registered = await f.registration();
    assert.equal(registered.status, 201); assert.equal(registered.body.user.email, 'new.member+test@example.com');
    assert(registered.body.user.hasPassword); assert.match(registered.body.user.nickname, /^校园用户[a-f0-9]{6}$/);
    assert(!registered.body.user.nickname.includes('new.member'));
    assert.equal(registered.body.token.length, 43);
    assert.equal((await f.call('/api/v1/me', undefined, { authorization: `Bearer ${registered.body.token}` })).status, 200);
    const user = f.app.db.prepare('SELECT * FROM users WHERE id=?').get(registered.body.user.id)!;
    assert.equal(user.email_verified_at, user.created_at); assert.equal(user.phone, null); assert.equal(user.school_id, 'school_test');
    assert.match(String(user.password_hash), /^scrypt:/); assert(!String(user.password_hash).includes('demo password'));
    const consent = f.app.db.prepare('SELECT * FROM registration_consents WHERE user_id=?').get(String(user.id))!;
    assert.equal(consent.agreement_version, AGREEMENT_VERSION); assert.equal(consent.privacy_version, PRIVACY_VERSION);
    assert.equal(consent.accepted_at, user.created_at);
    const login = await f.call('/api/v1/auth/password/sessions', { email: 'NEW.MEMBER+TEST@example.com', password: ' demo password ' });
    assert.equal(login.status, 201);
    await f.restart();
    assert.equal((await f.call('/api/v1/me', undefined, { authorization: `Bearer ${registered.body.token}` })).status, 200);
    assert.equal(f.app.db.prepare('SELECT COUNT(*) AS n FROM registration_consents').get()!.n, 1);
    assert.equal((await f.call('/api/v1/auth/password/sessions', { email: 'new.member+test@example.com', password: ' demo password ' })).status, 201);
    // Obsolete image-CAPTCHA fields do not replace the required email verification.
    assert.equal((await f.registration({ email: 'another@example.net', captchaId: '', captchaCode: '' })).status, 201);
  } finally { await f.close(); }
});

test('注册要求当前协议版本及合法邮箱密码，非学校邮箱也必须通过邮箱验证', async () => {
  const f = await fixture();
  try {
    for (const overrides of [{ agreementVersion: undefined }, { privacyVersion: undefined },
      { agreementVersion: '2026-10-23-draft-4' }, { privacyVersion: '2026-10-23-draft-4' },
      { email: 'invalid' }, { password: 'short' }, { password: ' '.repeat(6) }, { password: 'a'.repeat(65) }]) {
      const response = await f.registration(overrides);
      assert.equal(response.status, 400);
      assert.equal(f.app.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 0);
    }
    const registered = await f.registration({ email: 'test@non-school.example', password: '123456' });
    assert.equal(registered.status, 201);
    assert(Number(f.app.db.prepare('SELECT email_verified_at FROM users').get()!.email_verified_at) > 0);
  } finally { await f.close(); }
});

test('有效邮箱验证码的并发规范化重复注册只创建一个账号；不同邮箱可注册', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.registration({ password: 'short' })).status, 400);
    const results = await Promise.all([f.registration(), f.registration({ email: 'new.member+test@example.com' })]);
    assert.deepEqual(results.map(item => item.status).sort(), [201, 409]);
    assert.equal(results.find(item => item.status === 409)!.body.code, 'EMAIL_EXISTS');
    for (const table of ['users','auth_sessions','registration_consents']) assert.equal(f.app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 1);
    const additional = await Promise.all(['other@example.com','third@example.com'].map(email => f.registration({ email })));
    assert.deepEqual(additional.map(item => item.status), [201, 201]);
  } finally { await f.close(); }
});

test('会话写入失败回滚账号、协议与验证码消费，修复后原验证码可重试', async () => {
  const f = await fixture();
  try {
    f.app.db.exec("CREATE TRIGGER reject_session BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
    assert.equal((await f.registration()).status, 500);
    for (const table of ['users','auth_sessions','registration_consents','auth_captchas']) assert.equal(f.app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0);
    f.app.db.exec('DROP TRIGGER reject_session');
    assert.equal((await f.registration()).status, 201);
  } finally { await f.close(); }
});

test('注册限流、并发不能超额、重启保留限制且忽略 x-forwarded-for', async () => {
  const f = await fixture();
  try {
    const attempts = await Promise.all(Array.from({ length: 21 }, (_, n) => f.call('/api/v1/auth/registrations',
      { email: `member${n}@example.com`, password: 'short', agreementVersion: AGREEMENT_VERSION, privacyVersion: PRIVACY_VERSION },
      { 'x-real-ip': '203.0.113.10', 'x-forwarded-for': `198.51.100.${n}` })));
    assert.equal(attempts.filter(item => item.status === 400).length, 20);
    assert.equal(attempts.filter(item => item.status === 429).length, 1);
    await f.restart();
    assert.equal((await f.registration({}, '203.0.113.10')).status, 429);
    assert.equal((await f.registration({}, '203.0.113.11')).status, 201);
    f.app.db.prepare('UPDATE auth_registration_limits SET until_at=1').run();
    f.app.db.prepare('INSERT INTO auth_captchas VALUES(?,?,?,?)').run('legacy_captcha', '203.0.113.10', 'legacy-hash', 1);
    assert.equal((await f.registration({ email: 'after-limit@example.com' }, '203.0.113.10')).status, 201);
    assert.equal(f.app.db.prepare('SELECT COUNT(*) AS n FROM auth_captchas').get()!.n, 0);
  } finally { await f.close(); }
});

test('注册限流覆盖全局预算和存储容量', () => {
  const config = configFor(), db = openDatabase(config), protection = new RegistrationProtection(db);
  try {
    db.prepare('INSERT INTO auth_registration_limits VALUES(?,?,?,?)').run('registration_global', '*', 500, Date.now() + 60_000);
    assert.throws(() => protection.reserveRegistration('203.0.113.1'), { status: 429 });
    db.exec('DELETE FROM auth_registration_limits');
    db.exec('BEGIN');
    for (let index = 0; index < 9999; index++) db.prepare('INSERT INTO auth_registration_limits VALUES(?,?,1,?)')
      .run('registration_ip', `source${index}`, Date.now() + 60_000);
    db.exec('COMMIT');
    assert.throws(() => protection.reserveRegistration('new-source'), { status: 429 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_registration_limits').get()!.n, 9999);
  } finally { db.close(); }
});

test('v3 升级 v6 保留原账号、会话和登录预算，新表可重复打开且外键完整', async () => {
  const config = configFor(), old = openDatabase(config);
  const [account] = await provisionAccounts(old, config.schoolId, [{ email: 'existing@example.com', password: 'demopw' }]);
  old.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
    .run('old_session', account!.id, tokenHash('existing-session', config), Date.now() + 60_000);
  old.prepare('INSERT INTO auth_login_attempts VALUES(?,?,?,?)').run('email', 'existing@example.com', 4, Date.now() + 60_000);
  const before = old.prepare('SELECT * FROM users').all();
  old.exec('DROP TABLE registration_consents; DROP TABLE auth_registration_limits; DROP TABLE auth_captchas; PRAGMA user_version=3;');
  old.close();
  for (let n = 0; n < 2; n++) {
    const db = openDatabase(config);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 7);
      assert.deepEqual(db.prepare('SELECT * FROM users').all(), before);
      assert.equal(db.prepare('SELECT revoked_at FROM auth_sessions').get()!.revoked_at, null);
      assert.equal(db.prepare('SELECT count FROM auth_login_attempts').get()!.count, 4);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      for (const table of ['auth_captchas','auth_registration_limits','registration_consents']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0);
    } finally { db.close(); }
  }
});
