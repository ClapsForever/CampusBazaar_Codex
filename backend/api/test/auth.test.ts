import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { normalizeEmail, provisionAccounts } from '../src/accounts.js';
import { loadConfig, type Config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { tokenHash } from '../src/http.js';
import { hashPassword } from '../src/password.js';
import { createApiApp } from '../src/server.js';

function configFor(directory: string): Config {
  return { mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(directory, 'db.sqlite'),
    uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'this-is-a-long-test-only-session-secret', agentBaseUrl: 'http://127.0.0.1:1',
    agentServiceToken: 'test-agent-service-token-a', internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_demo' };
}

test('配置不再依赖开发验证码，邮箱统一大小写但保留加号和点', () => {
  const config = loadConfig({ APP_MODE: 'local', DATABASE_PATH: '/tmp/demo.sqlite', UPLOAD_DIR: '/tmp/demo-uploads',
    PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'a'.repeat(32), AGENT_BASE_URL: 'http://127.0.0.1:3000',
    AGENT_SERVICE_TOKEN: 'b'.repeat(32), INTERNAL_AGENT_TOKEN: 'c'.repeat(32) });
  assert(!('devLoginCode' in config));
  assert.equal(normalizeEmail(' Member.Name+Demo@Example.COM '), 'member.name+demo@example.com');
  for (const value of ['', '13800000001', 'a@@example.com', 'a b@example.com', 1, 'a'.repeat(65) + '@example.com']) {
    assert.throws(() => normalizeEmail(value));
  }
});

test('预置账号才能登录，固定验证码与手机号入口关闭，停用账号立即失效，管理员可重置密码', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-email-auth-'));
  const config = configFor(directory);
  let app = createApiApp(config), base = '';
  async function start() {
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address(); assert(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
  }
  async function call(route: string, body?: unknown, token?: string) {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  }
  const login = (email: string, password = 'demoaa') => call('/api/v1/auth/password/sessions', { email, password });
  try {
    await start();
    await provisionAccounts(app.db, config.schoolId, [{ email: ' Member@Example.COM ', password: 'demoaa', nickname: '演示同学' }]);
    assert.equal((await call('/api/v1/auth/local/sessions', { phone: '13800000001', smsCode: '123456' })).status, 404);
    assert.equal((await call('/api/v1/auth/local/sessions', { phone: '13800000001', code: '123456' })).status, 404);
    assert.equal((await call('/api/v1/auth/password/sessions', { phone: '13800000001', password: 'demoaa' })).status, 400);
    assert.equal((await login('unknown@example.com')).status, 401);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 1);
    const first = await login(' MEMBER@example.com '), second = await login('member@example.com');
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    assert.equal(first.body.user.email, 'member@example.com');
    assert(!('password_hash' in first.body.user));
    assert.equal((await call('/api/v1/me', undefined, first.body.token)).status, 200);
    app.db.prepare('UPDATE users SET enabled=0').run();
    assert.equal((await call('/api/v1/me', undefined, first.body.token)).status, 401);
    assert.equal((await login('member@example.com')).status, 401);
    app.db.prepare('UPDATE users SET enabled=1').run();
    await provisionAccounts(app.db, config.schoolId, [{ email: 'member@example.com', password: 'newdemo' }], 'reset');
    assert.equal((await call('/api/v1/me', undefined, first.body.token)).status, 401);
    assert.equal((await call('/api/v1/me', undefined, second.body.token)).status, 401);
    assert.equal((await login('member@example.com')).status, 401);
    assert.equal((await login('member@example.com', 'newdemo')).status, 201);
    // Canonical email variants share the budget, including across a restart.
    for (let n = 0; n < 5; n++) assert.equal((await login(n % 2 ? 'MEMBER@EXAMPLE.COM' : ' member@example.com ', 'wrong')).status, 401);
    await app.close(); app = createApiApp(config); await start();
    assert.equal((await login('member@example.com', 'newdemo')).status, 429);
    app.db.prepare('UPDATE auth_login_attempts SET until_at=1').run();
    assert.equal((await login('member@example.com', 'newdemo')).status, 201);
    // Parallel hashing must not allow six guesses against a five-attempt budget.
    const guesses = await Promise.all(Array.from({ length: 6 }, () => login('member@example.com', 'wrong')));
    assert.equal(guesses.filter(result => result.status === 401).length, 5);
    assert.equal(guesses.filter(result => result.status === 429).length, 1);
  } finally {
    await app.close();
  }
});

test('账号导入批次原子化，不覆盖已有账号，多个纯邮箱账号无需伪造手机号', async () => {
  const config = configFor(mkdtempSync(join(tmpdir(), 'campus-provision-')));
  const db = openDatabase(config);
  try {
    const accounts = await provisionAccounts(db, config.schoolId, ['first', 'second'].map(name => ({ email: `${name}@example.com`, password: 'demoaa' })));
    assert.equal(accounts.length, 2);
    const before = db.prepare('SELECT * FROM users ORDER BY id').all();
    assert(before.every(user => user.phone === null && user.email_verified_at === null));
    assert(before.every(user => typeof user.password_hash === 'string' && !user.password_hash.includes('demoaa')));
    await assert.rejects(provisionAccounts(db, config.schoolId, [
      { email: 'new@example.com', password: 'demoaa' }, { email: 'FIRST@example.com', password: 'changed' }
    ]));
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), before);
    await assert.rejects(provisionAccounts(db, config.schoolId, [{ email: 'bad@example.com', password: 'short' }]));
    await assert.rejects(provisionAccounts(db, config.schoolId, [{ email: 'missing@example.com', password: 'demoaa' }], 'reset'));
  } finally { db.close(); }
});

test('v2 迁移保留用户、商品、交易、消息与历史引用，撤销旧令牌；绑定邮箱保留原账号', async () => {
  const config = configFor(mkdtempSync(join(tmpdir(), 'campus-v2-auth-')));
  const hash = await hashPassword('legacy');
  const old = new DatabaseSync(config.databasePath);
  old.exec(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE users(id TEXT PRIMARY KEY,phone TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL,avatar TEXT NOT NULL,school_id TEXT NOT NULL,created_at INTEGER NOT NULL,password_hash TEXT);
    CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),token_hash TEXT,expires_at INTEGER,revoked_at INTEGER);
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,
      title TEXT NOT NULL,description TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents > 0),
      category TEXT NOT NULL,condition TEXT NOT NULL,campus TEXT NOT NULL,version TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SOLD')),published_at INTEGER NOT NULL);
    CREATE TABLE transactions(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),
      buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),
      school_id TEXT NOT NULL,create_time INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','REJECTED','COMPLETED')),
      price_cents INTEGER NOT NULL,title_snapshot TEXT NOT NULL);
    CREATE TABLE messages(id TEXT PRIMARY KEY,transaction_id TEXT NOT NULL REFERENCES transactions(id),
      sender_id TEXT NOT NULL REFERENCES users(id),content TEXT NOT NULL,send_time INTEGER NOT NULL);
    CREATE TABLE agent_sessions(session_id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created_at INTEGER);
    CREATE TABLE agent_turns(id INTEGER PRIMARY KEY,session_id TEXT REFERENCES agent_sessions(session_id),question TEXT);
    INSERT INTO products VALUES('listing_old','user_old','school_demo','旧商品','测试',100,'其他','good','江湾校区',NULL,'ACTIVE',1);
    INSERT INTO transactions VALUES('trade_old','listing_old','user_old','user_old','school_demo',1,'PENDING',100,'旧商品');
    INSERT INTO messages VALUES('message_old','trade_old','user_old','你好',1);
    INSERT INTO agent_sessions VALUES('session_old','user_old',1);
    INSERT INTO agent_turns VALUES(1,'session_old','找教材');
    PRAGMA user_version=2;
  `);
  old.prepare("INSERT INTO users VALUES('user_old','13800000001','旧昵称','','school_demo',1,?)").run(hash);
  old.prepare("INSERT INTO auth_sessions VALUES('auth_old','user_old',?,?,NULL)").run(tokenHash('legacy-token', config), Date.now() + 86_400_000);
  old.close();
  const db = openDatabase(config);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 4);
    assert.equal(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT password_hash FROM users').get()!.password_hash, hash);
    assert(db.prepare('SELECT revoked_at FROM auth_sessions').get()!.revoked_at);
    for (const table of ['users','products','transactions','messages','agent_sessions','agent_turns']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 1);
    }
    const migrated = await provisionAccounts(db, config.schoolId, [{ email: 'legacy@example.com', password: 'newdemo', existingUserId: 'user_old' }]);
    assert.equal(migrated[0]!.id, 'user_old'); assert.equal(migrated[0]!.nickname, '旧昵称');
    assert.equal(db.prepare('SELECT seller_id FROM products').get()!.seller_id, 'user_old');
    assert.equal(db.prepare('SELECT phone FROM users').get()!.phone, '13800000001');
    assert.equal(db.prepare('SELECT email_verified_at FROM users').get()!.email_verified_at, null);
  } finally { db.close(); }
  const reopened = openDatabase(config);
  assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 1);
  reopened.close();
});
