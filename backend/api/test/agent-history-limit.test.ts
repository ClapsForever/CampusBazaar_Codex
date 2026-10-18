import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Config } from '../src/config.js';
import { provisionAccounts } from '../src/accounts.js';
import { createApiApp } from '../src/server.js';

test('AI 找物记录每人最多 10 条，超出自动淘汰最旧记录并支持手动删除', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-agent-history-'));
  let sequence = 0;
  const agent = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const sessionId = input.sessionId ?? `session_${++sequence}`;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ requestId: input.requestId, sessionId, status: 'completed',
      reply: `回复：${input.message}`, recommendations: [], relaxedConditions: [] }));
  });
  await new Promise<void>(resolve => agent.listen(0, '127.0.0.1', resolve));
  const agentAddress = agent.address();
  assert(agentAddress && typeof agentAddress !== 'string');
  const config: Config = {
    mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(directory, 'database.sqlite'),
    uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'this-is-a-long-random-test-only-session-secret',
    agentBaseUrl: `http://127.0.0.1:${agentAddress.port}`, agentServiceToken: 'agent-service-token-test-a',
    internalAgentToken: 'business-backend-token-test-b', schoolId: 'school_demo'
  };
  const app = createApiApp(config);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  config.publicBaseUrl = base;

  async function call(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; body: any }> {
    const response = await fetch(base + path, { method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }

  try {
    await provisionAccounts(app.db, config.schoolId, [
      { email: 'a@example.com', password: 'Campus123' },
      { email: 'b@example.com', password: 'Campus123' }
    ]);
    const login = async (email: string): Promise<string> =>
      (await call('POST', '/api/v1/auth/password/sessions', undefined, { email, password: 'Campus123' })).body.token;
    const a = await login('a@example.com');
    const b = await login('b@example.com');

    for (let index = 1; index <= 12; index++) {
      const result = await call('POST', '/api/agent/chat', a, {
        requestId: `req_${index}`, sessionId: null, message: `找物 ${index}`
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.sessionId, `session_${index}`);
    }

    const history = await call('GET', '/api/v1/agent/conversations?limit=20', a);
    assert.equal(history.status, 200);
    assert.equal(history.body.items.length, 10);
    const remaining = history.body.items.map((item: any): string => item.sessionId).sort();
    const expected = Array.from({ length: 10 }, (_value, index): string => `session_${index + 3}`).sort();
    assert.deepEqual(remaining, expected);
    assert.equal((await call('GET', '/api/v1/agent/conversations/session_1', a)).status, 404);
    assert.equal((await call('GET', '/api/v1/agent/conversations/session_2', a)).status, 404);

    assert.equal((await call('DELETE', '/api/v1/agent/conversations/session_12', b)).status, 403);
    assert.equal((await call('DELETE', '/api/v1/agent/conversations/session_12', a)).status, 200);
    assert.equal((await call('GET', '/api/v1/agent/conversations/session_12', a)).status, 404);
    const afterDelete = await call('GET', '/api/v1/agent/conversations', a);
    assert.equal(afterDelete.body.items.length, 9);
    assert.equal(afterDelete.body.items.some((item: any): boolean => item.sessionId === 'session_12'), false);
    assert.equal((await call('DELETE', '/api/v1/agent/conversations/session_404', a)).status, 404);
  } finally {
    await app.close();
    await new Promise<void>(resolve => agent.close(() => resolve()));
    console.log('Test data retained:', directory);
  }
});
