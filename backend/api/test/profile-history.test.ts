import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { Config } from '../src/config.js';
import { createApiApp } from '../src/server.js';
import { openDatabase } from '../src/db.js';

function configFor(directory: string): Config {
  return { mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(directory, 'db.sqlite'),
    uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'this-is-a-long-test-only-session-secret', devLoginCode: '123456',
    agentBaseUrl: 'http://127.0.0.1:1', agentServiceToken: 'test-agent-service-token-a',
    internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_demo' };
}

test('v1 数据库升级保留旧用户与会话，且重复启动不会重复迁移', () => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-migration-'));
  const config = configFor(directory);
  const old = new DatabaseSync(config.databasePath);
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, phone TEXT, nickname TEXT, avatar TEXT, school_id TEXT, created_at INTEGER);
    CREATE TABLE agent_sessions(session_id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),created_at INTEGER);
    INSERT INTO users VALUES('user_old','13800000001','旧昵称','','school_demo',1);
    INSERT INTO agent_sessions VALUES('session_old','user_old',1); PRAGMA user_version=1;`);
  old.close();
  for (let index = 0; index < 2; index++) {
    const db = openDatabase(config);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 2);
    assert.equal(db.prepare('SELECT nickname FROM users').get()!.nickname, '旧昵称');
    assert.equal(db.prepare('SELECT password_hash FROM users').get()!.password_hash, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_sessions').get()!.count, 1);
    db.close();
  }
});

test('头像昵称密码与对话历史：持久化、分页、越权、失败保护与密码会话失效', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-profile-history-'));
  const config = configFor(directory);
  let sessionSequence = 0, agentCalls = 0;
  const agent = createServer(async (req, res) => {
    agentCalls++;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(input.message === '失败' ? 503 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(input.message === '失败' ? { code: 'AGENT_UNAVAILABLE', message: '离线' } : {
      requestId: input.requestId, sessionId: input.sessionId ?? `session_history_${++sessionSequence}`,
      status: 'completed', reply: `回复：${input.message}`,
      recommendations: input.message === '无效推荐' ? [{ listingId: 'listing_1', reasons: [123] }] : [],
      relaxedConditions: [] }));
  });
  await new Promise<void>(resolve => agent.listen(0, '127.0.0.1', resolve));
  const agentAddress = agent.address(); assert(agentAddress && typeof agentAddress !== 'string');
  config.agentBaseUrl = `http://127.0.0.1:${agentAddress.port}`;
  let app = createApiApp(config), base = '';
  async function start() {
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address(); assert(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`; config.publicBaseUrl = base;
  }
  await start();
  async function call(method: string, route: string, token?: string, body?: unknown) {
    const response = await fetch(base + route, { method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  }
  const login = async (phone: string) => (await call('POST', '/api/v1/auth/local/sessions', undefined,
    { phone, smsCode: '123456' })).body;
  try {
    const a = await login('13800000001'), b = await login('13800000002');
    const otherSession = await login('13800000001');
    assert.equal(a.user.hasPassword, false);
    assert.equal((await call('PUT', '/api/v1/me', undefined, { nickname: '未登录' })).status, 401);
    assert.equal((await call('PUT', '/api/v1/me', a.token, { nickname: ' ' })).status, 400);
    assert.equal((await call('PUT', '/api/v1/me', a.token, { nickname: 'a'.repeat(25) })).status, 400);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6GQAAAABJRU5ErkJggg==', 'base64');
    const uploaded = await fetch(base + '/api/v1/uploads', { method: 'POST', headers: {
      authorization: `Bearer ${a.token}`, 'content-type': 'image/png' }, body: png });
    assert.equal(uploaded.status, 201);
    const image = await uploaded.json() as any;
    assert.equal((await call('PUT', '/api/v1/me', b.token, { avatarId: image.id })).status, 403);
    assert.equal((await call('PUT', '/api/v1/me', a.token, { avatarId: 'https://example.com/avatar.png' })).status, 403);
    const profile = await call('PUT', '/api/v1/me', a.token, { nickname: ' 校园同学 ', avatarId: image.id });
    assert.equal(profile.body.nickname, '校园同学');
    assert.equal((await fetch(profile.body.avatar)).status, 200);
    assert.equal((await call('POST', '/api/v1/products', a.token, {
      title: '不能复用头像', description: '测试', price: 2, imageIds: [image.id] })).status, 403);
    // Avatars older than a day must survive startup's abandoned-upload cleanup.
    app.db.prepare('UPDATE product_images SET created_at=1 WHERE id=?').run(image.id);

    assert.equal((await call('POST', '/api/v1/me/password', a.token, { newPassword: 'short', smsCode: '123456' })).status, 400);
    assert.equal((await call('POST', '/api/v1/me/password', a.token, { newPassword: 'Campus123', smsCode: '000000' })).status, 401);
    const password = await call('POST', '/api/v1/me/password', a.token, { newPassword: 'Campus123', smsCode: '123456' });
    assert.equal(password.body.hasPassword, true);
    assert(!('password_hash' in password.body));
    assert.equal((await call('GET', '/api/v1/me', otherSession.token)).status, 401);
    const stored = app.db.prepare('SELECT password_hash FROM users WHERE id=?').get(a.user.id)!;
    assert.match(String(stored.password_hash), /^scrypt:/); assert(!String(stored.password_hash).includes('Campus123'));
    assert.equal((await call('POST', '/api/v1/auth/password/sessions', undefined, { phone: '13800000001', password: 'wrong' })).status, 401);
    const byPassword = await call('POST', '/api/v1/auth/password/sessions', undefined, { phone: '13800000001', password: 'Campus123' });
    assert.equal(byPassword.status, 201);
    assert.equal((await call('POST', '/api/v1/me/password', a.token, { newPassword: 'Changed123', currentPassword: 'wrong' })).status, 401);
    assert.equal((await call('POST', '/api/v1/me/password', a.token, { newPassword: 'Changed123', currentPassword: 'Campus123' })).status, 200);
    assert.equal((await call('GET', '/api/v1/me', byPassword.body.token)).status, 401);
    assert.equal((await call('POST', '/api/v1/auth/password/sessions', undefined, { phone: '13800000001', password: 'Campus123' })).status, 401);

    const chat = async (requestId: string, sessionId: string | null, message: string, token = a.token) =>
      call('POST', '/api/agent/chat', token, { requestId, sessionId, message });
    const first = await chat('history_1', null, '找教材');
    const id = first.body.sessionId;
    await chat('history_2', id, '预算 80 元');
    await chat('history_2', id, '预算 80 元'); // Retried response must not duplicate a turn.
    assert.equal((await chat('history_2', id, '不同问题')).status, 409);
    assert.equal((await chat('history_fail', id, '失败')).status, 503);
    assert.equal((await chat('history_invalid', id, '无效推荐')).status, 502);
    const second = await chat('history_3', null, '找台灯');
    app.db.prepare('UPDATE agent_sessions SET created_at=100 WHERE session_id=?').run(id);
    app.db.prepare('UPDATE agent_sessions SET created_at=200 WHERE session_id=?').run(second.body.sessionId);
    const list = await call('GET', '/api/v1/agent/conversations?limit=1', a.token);
    assert.equal(list.body.items[0].sessionId, second.body.sessionId);
    const older = await call('GET', '/api/v1/agent/conversations?limit=1&cursor=' + encodeURIComponent(list.body.nextCursor), a.token);
    assert.equal(older.body.items[0].sessionId, id); assert.equal(older.body.items[0].turnCount, 2);
    assert.equal(older.body.nextCursor, null);
    const turns = await call('GET', `/api/v1/agent/conversations/${id}?limit=1`, a.token);
    assert.equal(turns.body.items[0].question, '找教材');
    const later = await call('GET', `/api/v1/agent/conversations/${id}?limit=1&cursor=${turns.body.nextCursor}`, a.token);
    assert.equal(later.body.items[0].question, '预算 80 元'); assert.equal(later.body.nextCursor, null);
    assert.equal((await call('GET', '/api/v1/agent/conversations', b.token)).body.items.length, 0);
    assert.equal((await call('GET', `/api/v1/agent/conversations/${id}`, b.token)).status, 403);
    const callsBefore = agentCalls;
    assert.equal((await chat('foreign', id, '偷窥', b.token)).status, 403); assert.equal(agentCalls, callsBefore);
    assert.equal((await call('GET', '/api/v1/agent/conversations')).status, 401);

    await app.close(); app = createApiApp(config); await start();
    const restored = await call('GET', '/api/v1/me', a.token);
    assert.equal(restored.body.nickname, '校园同学'); assert.equal(restored.body.hasPassword, true);
    assert.equal((await fetch(restored.body.avatar)).status, 200);
    assert.equal((await call('GET', `/api/v1/agent/conversations/${id}`, a.token)).body.items.length, 2);
    assert.equal((await call('GET', '/api/v1/agent/conversations', a.token)).body.items.length, 2);
    assert.equal((await call('POST', '/api/v1/auth/password/sessions', undefined, { phone: '13800000001', password: 'Changed123' })).status, 201);
    for (let index = 0; index < 5; index++) {
      assert.equal((await call('POST', '/api/v1/auth/password/sessions', undefined,
        { phone: '13800000001', password: 'wrong' })).status, 401);
    }
    assert.equal((await call('POST', '/api/v1/auth/password/sessions', undefined,
      { phone: '13800000001', password: 'Changed123' })).status, 429);
    assert.equal((await login('13800000001')).user.id, a.user.id);
  } finally {
    await app.close(); await new Promise<void>(resolve => agent.close(() => resolve()));
    console.log('Profile/history test data retained:', directory);
  }
});
