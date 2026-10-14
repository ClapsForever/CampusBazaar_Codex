import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { provisionAccounts } from '../src/accounts.js';
import { createApiApp } from '../src/server.js';

test('发布通用品类兼容具体物品搜索、预约移出及拒绝恢复、真实消息摘要', async () => {
  const data = mkdtempSync(join(tmpdir(), 'campus-ui-contract-'));
  const config = { mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(data, 'db.sqlite'),
    uploadDir: join(data, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'this-is-a-long-test-only-session-secret',
    agentBaseUrl: 'http://127.0.0.1:1', agentServiceToken: 'test-agent-service-token-a',
    internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_demo' };
  const app = createApiApp(config);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (method, route, token, body, headers = {}) => {
    const response = await fetch(base + route, { method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}), ...headers
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await provisionAccounts(app.db, config.schoolId, ['seller', 'buyer'].map(name => ({ email: `${name}@example.com`, password: 'Campus123' })));
    const seller = (await call('POST', '/api/v1/auth/password/sessions', null, { email: 'seller@example.com', password: 'Campus123' })).body;
    const buyer = (await call('POST', '/api/v1/auth/password/sessions', null, { email: 'buyer@example.com', password: 'Campus123' })).body;
    const draft = { title: '蓝牙耳机', description: '九成新\n见面地点：图书馆门口', price: 20.5,
      category: '外设', condition: 'like_new', campus: '江湾校区', imageIds: [] };
    const published = await call('POST', '/api/v1/products', seller.token, draft);
    assert.equal(published.status, 201);
    assert.equal(published.body.category, '外设'); assert.equal(published.body.campus, '江湾校区');
    assert.match(published.body.description, /见面地点：图书馆门口/);
    const id = published.body.id;
    const trusted = { authorization: `Bearer ${config.internalAgentToken}`, 'x-user-id': buyer.user.id, 'x-school-id': 'school_demo' };
    const lookup = '/internal/listings/search?category=' + encodeURIComponent('耳机') + '&campus=' + encodeURIComponent('江湾校区');
    assert.equal((await call('GET', lookup, null, null, trusted)).body.listings[0].listingId, id);
    const groupedLookup = '/internal/listings/search?category=' + encodeURIComponent('外设') + '&keyword=' + encodeURIComponent('耳机');
    assert.equal((await call('GET', groupedLookup, null, null, trusted)).body.listings[0].listingId, id);
    assert.equal((await call('GET', '/internal/listings/search?category=' + encodeURIComponent('键盘'), null, null, trusted)).body.total, 0);
    assert.equal((await call('GET', '/api/v1/products?q=' + encodeURIComponent('蓝牙耳机'), buyer.token)).body.items[0].id, id);
    assert.equal((await call('POST', '/api/v1/transactions', seller.token, { productId: id })).status, 403);
    const trade = (await call('POST', '/api/v1/transactions', buyer.token, { productId: id })).body;
    assert.equal((await call('GET', '/api/v1/products', buyer.token)).body.items.length, 0);
    assert.equal((await call('GET', lookup, null, null, trusted)).body.total, 0);
    assert.equal((await call('GET', groupedLookup, null, null, trusted)).body.total, 0);
    await call('POST', `/api/v1/transactions/${trade.id}/messages`, buyer.token, { content: '图书馆门口见' });
    const list = await call('GET', '/api/v1/transactions', seller.token);
    assert.equal(list.body.items[0].latestMessage.content, '图书馆门口见');
    assert.equal((await call('POST', `/api/v1/transactions/${trade.id}/reject`, seller.token)).body.status, 'REJECTED');
    assert.equal((await call('GET', '/api/v1/products', buyer.token)).body.items[0].id, id);
    assert.equal((await call('GET', lookup, null, null, trusted)).body.listings[0].listingId, id);
    const mine = await call('GET', '/api/v1/me/products', buyer.token); assert.equal(mine.body.items.length, 0);
  } finally {
    await app.close(); console.log('Contract data retained:', data);
  }
});
