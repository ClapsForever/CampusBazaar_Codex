import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { provisionAccounts } from '../src/accounts.js';
import type { Config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { Store } from '../src/store.js';
import { createApiApp } from '../src/server.js';

function configuration(): Config {
  const directory = mkdtempSync(join(tmpdir(), 'campus-manual-history-'));
  return { mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(directory, 'db.sqlite'),
    uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'synthetic-history-deletion-review-secret', agentBaseUrl: 'http://127.0.0.1:1',
    agentServiceToken: 'synthetic-agent-service-token-a', internalAgentToken: 'synthetic-internal-token-b', schoolId: 'school_demo' };
}

test('超过十段AI对话全部保留，分页可读，手动删除仅影响本人选中的会话与轮次', async () => {
  const config = configuration(), db = openDatabase(config), store = new Store(db, config);
  try {
    const [first, second] = await provisionAccounts(db, config.schoolId,
      ['first', 'second'].map(name => ({ email: `${name}@example.com`, password: 'Campus123' })));
    const owner = store.findUser(first!.id)!, other = store.findUser(second!.id)!;
    for (let index = 0; index < 15; index++) {
      store.saveAgentTurn(`session_keep_${index}`, owner, `问题${index}`, { requestId: `request_${index}` });
    }
    store.saveAgentTurn('session_other', other, '其他账号', { requestId: 'other_request' });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agent_sessions WHERE user_id=?').get(owner.id)!.n, 15);
    const seen: string[] = [];
    let cursor: unknown = null;
    do {
      const page = store.agentHistory(owner, new URLSearchParams({ limit: '4', ...(cursor ? { cursor: String(cursor) } : {}) }));
      seen.push(...(page.items as { sessionId: string }[]).map(item => item.sessionId));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(seen).size, 15);
    assert.throws(() => store.deleteAgentConversation('session_keep_0', other), { status: 403 });
    store.deleteAgentConversation('session_keep_0', owner);
    assert.equal(db.prepare('SELECT 1 FROM agent_sessions WHERE session_id=?').get('session_keep_0'), undefined);
    assert.equal(db.prepare('SELECT 1 FROM agent_turns WHERE session_id=?').get('session_keep_0'), undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agent_sessions WHERE user_id=?').get(owner.id)!.n, 14);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agent_sessions WHERE user_id=?').get(other.id)!.n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('删除AI历史后，在途续聊响应不能重新创建被删除会话', async () => {
  const config = configuration();
  let releaseReply: () => void = () => {}, markStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const reply = new Promise<void>(resolve => { releaseReply = resolve; });
  const agent = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    if (input.message === '等待删除') { markStarted(); await reply; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ requestId: input.requestId, sessionId: input.sessionId ?? 'session_deletion_race',
      status: 'completed', reply: '合成回复', recommendations: [], relaxedConditions: [] }));
  });
  await new Promise<void>(resolve => agent.listen(0, '127.0.0.1', resolve));
  const address = agent.address(); assert(address && typeof address !== 'string');
  config.agentBaseUrl = `http://127.0.0.1:${address.port}`;
  const app = createApiApp(config);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const apiAddress = app.server.address(); assert(apiAddress && typeof apiAddress !== 'string');
  const base = `http://127.0.0.1:${apiAddress.port}`;
  try {
    await provisionAccounts(app.db, config.schoolId, [{ email: 'race@example.com', password: 'Campus123' }]);
    const login = await fetch(base + '/api/v1/auth/password/sessions', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'race@example.com', password: 'Campus123' }) });
    const token = (await login.json() as { token: string }).token;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const chat = (requestId: string, sessionId: string | null, message: string) => fetch(base + '/api/agent/chat', {
      method: 'POST', headers, body: JSON.stringify({ requestId, sessionId, message }) });
    assert.equal((await chat('first', null, '创建对话')).status, 200);
    const pending = chat('second', 'session_deletion_race', '等待删除');
    await started;
    const deleted = await fetch(base + '/api/v1/agent/conversations/session_deletion_race', { method: 'DELETE', headers });
    assert.equal(deleted.status, 200);
    releaseReply();
    assert.equal((await pending).status, 404);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get()!.n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM agent_turns').get()!.n, 0);
  } finally {
    releaseReply();
    await app.close();
    await new Promise<void>(resolve => agent.close(() => resolve()));
  }
});
