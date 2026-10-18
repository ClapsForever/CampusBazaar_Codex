import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Config } from '../src/config.js';
import { provisionAccounts } from '../src/accounts.js';
import { createApiApp } from '../src/server.js';

type Result = { status: number; body: any };

test('卖家下架、买卖双方取消交易与多条件商品筛选', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'campusbazaar-marketplace-'));
  const config: Config = {
    mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(directory, 'database.sqlite'),
    uploadDir: join(directory, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'this-is-a-long-random-test-only-session-secret',
    agentBaseUrl: 'http://127.0.0.1:1', agentServiceToken: 'agent-service-token-test-a',
    internalAgentToken: 'business-backend-token-test-b', schoolId: 'school_demo'
  };
  const app = createApiApp(config);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  config.publicBaseUrl = base;

  async function call(method: string, path: string, token?: string, body?: unknown): Promise<Result> {
    const response = await fetch(base + path, { method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }

  try {
    await provisionAccounts(app.db, config.schoolId, [
      { email: 'seller@example.com', password: 'Campus123' },
      { email: 'buyer@example.com', password: 'Campus123' },
      { email: 'other@example.com', password: 'Campus123' }
    ]);
    const login = async (email: string): Promise<any> =>
      (await call('POST', '/api/v1/auth/password/sessions', undefined, { email, password: 'Campus123' })).body;
    const seller = await login('seller@example.com');
    const buyer = await login('buyer@example.com');
    const other = await login('other@example.com');

    const publish = async (title: string, price: number, category: string, campus: string): Promise<any> => {
      const result = await call('POST', '/api/v1/products', seller.token,
        { title, description: '测试商品', price, category, condition: 'good', campus, imageIds: [] });
      assert.equal(result.status, 201);
      return result.body;
    };
    const book = await publish('高数教材', 0.5, '教材', '江湾校区');
    const phone = await publish('旧手机', 5, '数码', '江湾校区');
    const keyboard = await publish('机械键盘', 20, '外设', '邯郸校区');
    const lamp = await publish('护眼台灯', 120, '日用', '江湾校区');

    const ids = async (query: string): Promise<string[]> =>
      (await call('GET', `/api/v1/products?${query}`, buyer.token)).body.items.map((item: any) => item.id).sort();
    assert.deepEqual(await ids(`categories=${encodeURIComponent('教材,外设')}&campuses=${encodeURIComponent('江湾校区')}`),
      [book.id]);
    assert.deepEqual(await ids('priceRanges=0-100,100-1000'), [phone.id, book.id].sort());
    assert.deepEqual(await ids(`categories=${encodeURIComponent('教材,数码')}&campuses=${encodeURIComponent('江湾校区')}&priceRanges=100-1000`),
      [phone.id]);
    assert.equal((await call('GET', '/api/v1/products?priceRanges=broken', buyer.token)).status, 400);
    assert.equal((await call('GET', '/api/v1/products?priceRanges=500-100', buyer.token)).status, 400);

    assert.equal((await call('POST', `/api/v1/products/${book.id}/delist`, other.token)).status, 403);
    const delisted = await call('POST', `/api/v1/products/${book.id}/delist`, seller.token);
    assert.equal(delisted.status, 200);
    assert.equal(delisted.body.status, 'DELISTED');
    assert.equal((await call('POST', `/api/v1/products/${book.id}/delist`, seller.token)).status, 200);
    assert.equal((await call('GET', '/api/v1/products?q=' + encodeURIComponent('高数教材'), buyer.token)).body.items.length, 0);
    assert.equal((await call('GET', `/api/v1/products/${book.id}`, buyer.token)).status, 404);
    assert.equal((await call('GET', `/api/v1/products/${book.id}`, seller.token)).body.product.status, 'DELISTED');
    const mine = (await call('GET', '/api/v1/me/products', seller.token)).body.items as any[];
    assert.equal(mine.find(item => item.id === book.id).status, 'DELISTED');

    const buy = async (productId: string): Promise<any> => {
      const result = await call('POST', '/api/v1/transactions', buyer.token, { productId });
      assert.equal(result.status, 201);
      return result.body;
    };
    const pendingTrade = await buy(phone.id);
    assert.equal((await call('POST', `/api/v1/products/${phone.id}/delist`, seller.token)).status, 409);
    assert.equal((await call('POST', `/api/v1/transactions/${pendingTrade.id}/cancel`, other.token)).status, 404);
    const buyerCancelled = await call('POST', `/api/v1/transactions/${pendingTrade.id}/cancel`, buyer.token);
    assert.equal(buyerCancelled.status, 200);
    assert.equal(buyerCancelled.body.status, 'CANCELLED');
    assert.equal((await call('GET', '/api/v1/products?q=' + encodeURIComponent('旧手机'), buyer.token)).body.items[0].id, phone.id);
    assert.equal((await call('POST', `/api/v1/transactions/${pendingTrade.id}/cancel`, buyer.token)).status, 409);
    assert.equal((await call('POST', `/api/v1/transactions/${pendingTrade.id}/messages`, buyer.token,
      { content: '取消后不能继续聊天' })).status, 409);

    const sellerCancelPending = await buy(phone.id);
    assert.equal((await call('POST', `/api/v1/transactions/${sellerCancelPending.id}/cancel`, seller.token)).body.status, 'CANCELLED');

    const acceptedTrade = await buy(phone.id);
    assert.equal((await call('POST', `/api/v1/transactions/${acceptedTrade.id}/accept`, seller.token)).body.status, 'ACCEPTED');
    assert.equal((await call('POST', `/api/v1/transactions/${acceptedTrade.id}/cancel`, seller.token)).body.status, 'CANCELLED');

    const buyerCancelAccepted = await buy(lamp.id);
    assert.equal((await call('POST', `/api/v1/transactions/${buyerCancelAccepted.id}/accept`, seller.token)).body.status, 'ACCEPTED');
    assert.equal((await call('POST', `/api/v1/transactions/${buyerCancelAccepted.id}/cancel`, buyer.token)).body.status, 'CANCELLED');
    assert.equal((await call('POST', `/api/v1/products/${lamp.id}/delist`, seller.token)).body.status, 'DELISTED');

    const completedTrade = await buy(keyboard.id);
    assert.equal((await call('POST', `/api/v1/transactions/${completedTrade.id}/accept`, seller.token)).body.status, 'ACCEPTED');
    assert.equal((await call('POST', `/api/v1/transactions/${completedTrade.id}/complete`, seller.token)).body.status, 'COMPLETED');
    assert.equal((await call('POST', `/api/v1/transactions/${completedTrade.id}/cancel`, buyer.token)).status, 409);
    assert.equal((await call('POST', `/api/v1/products/${keyboard.id}/delist`, seller.token)).status, 409);
  } finally {
    await app.close();
    console.log('Test data retained:', directory);
  }
});
