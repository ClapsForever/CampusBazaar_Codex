import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import type { Config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { Store } from '../src/store.js';

function fixture() {
  const config: Config = {
    mode: 'local', host: '127.0.0.1', port: 0, databasePath: ':memory:', uploadDir: tmpdir(),
    publicBaseUrl: 'http://127.0.0.1', sessionSecret: 'test-search-secret-longer-than-thirty-two-characters',
    agentBaseUrl: 'http://127.0.0.1:3000',
    agentServiceToken: 'test-search-agent-service-token', internalAgentToken: 'test-search-internal-token', schoolId: 'school_demo'
  };
  const db = openDatabase(config);
  const store = new Store(db, config);
  db.prepare("INSERT INTO users(id,email,nickname,avatar,school_id,created_at) VALUES('user_search','search@example.com','搜索同学','','school_demo',1)").run();
  const user = store.findUser('user_search')!;
  const insert = db.prepare(`INSERT INTO products
    (id,seller_id,school_id,title,description,price_cents,category,condition,campus,status,published_at)
    VALUES(?,?,?,?,'测试商品',?,'教材','like_new','邯郸校区',?,1)`);
  insert.run('listing_english', user.id, user.school_id, 'english book', 10_000_000, 'ACTIVE');
  insert.run('listing_chinese', user.id, user.school_id, '英语课本', 5000, 'ACTIVE');
  insert.run('listing_math', user.id, user.school_id, '高等数学教材', 3000, 'ACTIVE');
  insert.run('listing_foreign', user.id, 'school_other', 'english book', 3000, 'ACTIVE');
  insert.run('listing_sold', user.id, user.school_id, 'english book', 3000, 'SOLD');
  insert.run('listing_reserved', user.id, user.school_id, 'english book', 3000, 'ACTIVE');
  db.prepare(`INSERT INTO transactions
    (id,product_id,buyer_id,seller_id,school_id,create_time,status,price_cents,title_snapshot)
    VALUES('trade_reserved','listing_reserved',?,?,?,1,'PENDING',3000,'english book')`)
    .run(user.id, user.id, user.school_id);
  const search = (keyword: string, extra: Record<string, string> = {}) => {
    const result = store.internalSearch(user, new URLSearchParams({ keyword, ...extra }));
    return (result.listings as Array<{ listingId: string }>).map(item => item.listingId).sort();
  };
  const add = (id: string, title: string, category: string, school = user.school_id, status = 'ACTIVE') => {
    db.prepare(`INSERT INTO products
      (id,seller_id,school_id,title,description,price_cents,category,condition,campus,status,published_at)
      VALUES(?,?,?,?,'测试商品',5000,?,'like_new','邯郸校区',?,2)`)
      .run(id, user.id, school, title, category, status);
  };
  return { db, search, add, store, user };
}

test('英语书与 English book 可以交叉搜索，且保持学校、在售和交易占用限制', t => {
  const { db, search } = fixture();
  t.after(() => db.close());
  for (const query of ['英语', '英语书', '英文教材', 'English book', 'english textbooks']) {
    assert.deepEqual(search(query), ['listing_chinese', 'listing_english'], query);
  }
  assert.deepEqual(search('english keyboard'), []);
});

test('大类搜索包含新商品与历史小类，并继续执行学校和在售限制', t => {
  const { db, search, add } = fixture();
  t.after(() => db.close());
  add('listing_old_keyboard', '机械键盘', '键盘');
  add('listing_new_keyboard', '机械键盘', '外设');
  add('listing_new_headphone', '蓝牙耳机', '外设');
  add('listing_foreign_keyboard', '机械键盘', '外设', 'school_other');
  add('listing_sold_keyboard', '机械键盘', '外设', 'school_demo', 'SOLD');
  add('listing_old_daily', '台灯', '生活用品');
  add('listing_new_daily', '收纳盒', '日用');
  assert.deepEqual(search('', { category: '外设' }), ['listing_new_headphone', 'listing_new_keyboard', 'listing_old_keyboard']);
  assert.deepEqual(search('', { category: '日用' }), ['listing_new_daily', 'listing_old_daily']);
  assert.deepEqual(search('', { category: '教材' }), ['listing_chinese', 'listing_english', 'listing_math']);
});

test('按具体小物件搜索新大类时不会混入同类其他物件，预算仍有效', t => {
  const { db, search, add } = fixture();
  t.after(() => db.close());
  add('listing_old_keyboard', '机械键盘', '键盘');
  add('listing_new_keyboard', 'mechanical keyboard', '外设');
  add('listing_new_headphone', '蓝牙耳机', '外设');
  add('listing_new_bike', '山地单车', '运动');
  assert.deepEqual(search('', { category: '键盘' }), ['listing_new_keyboard', 'listing_old_keyboard']);
  assert.deepEqual(search('键盘', { category: '外设' }), ['listing_new_keyboard', 'listing_old_keyboard']);
  assert.deepEqual(search('', { category: '耳机' }), ['listing_new_headphone']);
  assert.deepEqual(search('', { category: '自行车' }), ['listing_new_bike']);
  assert.deepEqual(search('', { category: '键盘', maxPriceCents: '4000' }), []);
});

test('中英文同义匹配仍严格执行预算和校区条件', t => {
  const { db, search } = fixture();
  t.after(() => db.close());
  assert.deepEqual(search('英语书', { maxPriceCents: '8000' }), ['listing_chinese']);
  assert.deepEqual(search('english book', { maxPriceCents: '8000' }), ['listing_chinese']);
  assert.deepEqual(search('English book', { campus: '江湾校区' }), []);
});

test('最低成色包括更新商品，价格排序和排除关键词继续执行可见性与预算限制', t => {
  const { db, search, add, store, user } = fixture();
  t.after(() => db.close());
  add('listing_basic', '有线键盘', '外设');
  add('listing_mechanical', '机械键盘', '外设');
  add('listing_new', '全新蓝牙键盘', '外设');
  add('listing_private', '机械键盘', '外设', 'school_other');
  add('listing_sold_key', '机械键盘', '外设', 'school_demo', 'SOLD');
  db.prepare("UPDATE products SET price_cents=4000,condition='good' WHERE id='listing_basic'").run();
  db.prepare("UPDATE products SET price_cents=8000 WHERE id='listing_mechanical'").run();
  db.prepare("UPDATE products SET price_cents=12000,condition='new' WHERE id='listing_new'").run();
  assert.deepEqual(search('键盘', { condition: 'like_new' }), ['listing_mechanical', 'listing_new']);
  assert.deepEqual(search('键盘', { condition: 'new' }), ['listing_new']);
  assert.deepEqual(search('键盘', { maxPriceCents: '5000', sort: 'price_asc' }), ['listing_basic']);
  assert.deepEqual(search('键盘', { excludeKeywords: '["机械"]' }), ['listing_basic', 'listing_new']);
  assert.deepEqual(search('键盘', { excludeKeywords: '["机械 键盘"]' }), ['listing_basic', 'listing_new']);
  const ordered = store.internalSearch(user, new URLSearchParams({ keyword: '键盘', sort: 'price_asc', pageSize: '1' }));
  assert.deepEqual((ordered.listings as Array<{ listingId: string }>).map(p => p.listingId), ['listing_basic']);
  assert.equal(ordered.total, 3);
  assert.throws(() => search('键盘', { sort: 'price_asc; DROP TABLE products' }));
  assert.throws(() => search('键盘', { excludeKeywords: '[42]' }));
});

test('语义检索词取并集，替代主题的字面匹配，并在去重后统一排序分页', t => {
  const { db, store, user, add } = fixture();
  t.after(() => db.close());
  add('listing_linear', '线性代数教材', '教材');
  add('listing_notes', '线代复习讲义', '教材');
  add('listing_english_linear', 'linear algebra textbook', '教材');
  db.prepare("UPDATE products SET price_cents=2000 WHERE id='listing_linear'").run();
  db.prepare("UPDATE products SET price_cents=3000 WHERE id='listing_notes'").run();
  const params = new URLSearchParams({ keyword: '我需要一本线代教材', category: '教材',
    queryTerms: JSON.stringify(['线代', '线性代数', 'linear algebra', '代数']), sort: 'price_asc', pageSize: '2' });
  const first = store.internalSearch(user, params);
  assert.equal(first.total, 3);
  assert.equal(first.hasMore, true);
  assert.deepEqual((first.listings as any[]).map(p => p.listingId), ['listing_linear', 'listing_notes']);
  params.set('page', '2');
  const second = store.internalSearch(user, params);
  assert.equal(second.total, 3);
  assert.equal(second.hasMore, false);
  assert.deepEqual((second.listings as any[]).map(p => p.listingId), ['listing_english_linear']);
});

test('相关查询各自支持多词交集，且所有分支都遵守权限、交易占用和硬条件', t => {
  const { db, search, add } = fixture();
  t.after(() => db.close());
  add('listing_cet_vocab', '六级词汇书', '教材');
  add('listing_cet_words', '六级单词手册', '教材');
  add('listing_cet_test', '六级试卷', '教材');
  add('listing_cet4', '四级词汇书', '教材');
  const terms = JSON.stringify(['六级 词汇', '六级 单词']);
  assert.deepEqual(search('六级', { queryTerms: terms }), ['listing_cet_vocab', 'listing_cet_words']);
  assert.deepEqual(search('六级', { queryTerms: terms, excludeKeywords: '["单词"]' }), ['listing_cet_vocab']);
  assert.deepEqual(search('六级', { queryTerms: terms, maxPriceCents: '4000' }), []);
  assert.deepEqual(search('六级', { queryTerms: terms, campus: '江湾校区' }), []);
  assert.deepEqual(search('备考', { queryTerms: terms, condition: 'new' }), []);
  assert.deepEqual(search('备考', { queryTerms: terms, version: '第二版' }), []);
  assert.deepEqual(search('备考', { queryTerms: JSON.stringify(['英语', '高数']), maxPriceCents: '8000' }), ['listing_chinese', 'listing_math']);
});

test('相关检索可以命中描述，不将 SQL 字符当命令，拒绝空白和超限检索计划', t => {
  const { db, search, add } = fixture();
  t.after(() => db.close());
  add('listing_bag', '大号防水袋', '日用');
  db.prepare("UPDATE products SET description='搬家打包袋，可装书本' WHERE id='listing_bag'").run();
  assert.deepEqual(search('搬宿舍', { queryTerms: '["打包袋","手拉车"]' }), ['listing_bag']);
  assert.deepEqual(search('搬宿舍', { queryTerms: JSON.stringify(["') OR 1=1 --"]) }), []);
  for (const queryTerms of ['not-json', '[]', '[42]', '["   "]', JSON.stringify(['x'.repeat(81)]), JSON.stringify(Array(13).fill('词'))]) {
    assert.throws(() => search('线代', { queryTerms }), queryTerms);
  }
});
