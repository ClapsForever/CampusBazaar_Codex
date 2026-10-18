import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { Config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { tokenHash } from '../src/http.js';
import { hashPassword } from '../src/password.js';
import { AGREEMENT_VERSION, PRIVACY_VERSION } from '../src/registration.js';
import { Store } from '../src/store.js';

type LegacyLayout = 'v3' | 'marketplace-v4' | 'registration-v4';
const imageId = 'img_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const avatarId = 'img_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const imageBytes = Buffer.from('synthetic-preserved-image');

async function legacyFixture(layout: LegacyLayout) {
  const directory = mkdtempSync(join(tmpdir(), `campus-${layout}-to-v5-`));
  const config: Config = { mode: 'local', host: '127.0.0.1', port: 0,
    databasePath: join(directory, 'db.sqlite'), uploadDir: join(directory, 'uploads'),
    publicBaseUrl: 'http://127.0.0.1:0', sessionSecret: 'synthetic-migration-session-secret-32chars',
    agentBaseUrl: 'http://127.0.0.1:1', agentServiceToken: 'synthetic-migration-agent-token-a',
    internalAgentToken: 'synthetic-migration-internal-token-b', schoolId: 'school_preserved' };
  mkdirSync(config.uploadDir);
  const passwordHash = await hashPassword('Legacy123'), db = new DatabaseSync(config.databasePath);
  const marketplace = layout === 'marketplace-v4';
  // Construct the old layouts independently of the new migration implementation.
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,phone TEXT UNIQUE,nickname TEXT NOT NULL,avatar TEXT NOT NULL DEFAULT '',
      school_id TEXT NOT NULL,created_at INTEGER NOT NULL,password_hash TEXT,email TEXT UNIQUE,email_verified_at INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
    CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,revoked_at INTEGER);
    CREATE TABLE auth_login_attempts(scope TEXT NOT NULL,key TEXT NOT NULL,count INTEGER NOT NULL,until_at INTEGER NOT NULL,
      PRIMARY KEY(scope,key));
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,
      title TEXT NOT NULL,description TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>0),category TEXT NOT NULL,
      condition TEXT NOT NULL,campus TEXT NOT NULL,version TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK(status IN ('ACTIVE','SOLD'${marketplace ? ",'DELISTED'" : ''})),published_at INTEGER NOT NULL);
    CREATE INDEX products_feed ON products(school_id,status,published_at DESC,id DESC);
    CREATE INDEX products_seller ON products(seller_id,published_at DESC,id DESC);
    CREATE TABLE product_images(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),product_id TEXT REFERENCES products(id),
      mime TEXT NOT NULL,extension TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE transactions(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),
      buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,
      create_time INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','REJECTED','COMPLETED'${marketplace ? ",'CANCELLED'" : ''})),
      price_cents INTEGER NOT NULL,title_snapshot TEXT NOT NULL);
    CREATE UNIQUE INDEX one_active_transaction_per_product ON transactions(product_id) WHERE status IN ('PENDING','ACCEPTED');
    CREATE INDEX transactions_buyer ON transactions(buyer_id,create_time DESC,id DESC);
    CREATE INDEX transactions_seller ON transactions(seller_id,create_time DESC,id DESC);
    CREATE TABLE messages(id TEXT PRIMARY KEY,transaction_id TEXT NOT NULL REFERENCES transactions(id),sender_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,send_time INTEGER NOT NULL);
    CREATE TABLE idempotency_records(scope TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),key TEXT NOT NULL,
      request_hash TEXT NOT NULL,response_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(scope,user_id,key));
    CREATE TABLE agent_sessions(session_id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
    CREATE TABLE agent_turns(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL REFERENCES agent_sessions(session_id),
      request_id TEXT NOT NULL,question TEXT NOT NULL,response_json TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(session_id,request_id));
    CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),favorite_categories TEXT NOT NULL DEFAULT '[]',
      preferred_campuses TEXT NOT NULL DEFAULT '[]',price_ceiling_cents INTEGER);
    PRAGMA user_version=${layout === 'v3' ? 3 : 4};`);
  for (const [id, email] of [['user_old', 'old@example.com'], ['user_buyer', 'buyer@example.com']]) {
    db.prepare('INSERT INTO users(id,nickname,school_id,created_at,password_hash,email) VALUES(?,?,?,?,?,?)')
      .run(id!, '原有用户', config.schoolId, 1, passwordHash, email!);
  }
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,NULL)').run('old_auth', 'user_old', tokenHash('preserved-token', config), Date.now() + 60_000);
  db.prepare('INSERT INTO auth_login_attempts VALUES(?,?,?,?)').run('email', 'old@example.com', 4, Date.now() + 60_000);
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('listing_old', 'user_old', config.schoolId, '原有商品', '保留描述', 2500, '教材', 'good', '江湾校区', '旧版本', 'ACTIVE', 1);
  db.prepare('INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?)')
    .run('trade_old', 'listing_old', 'user_buyer', 'user_old', config.schoolId, 2, 'PENDING', 2500, '原有商品');
  if (marketplace) {
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run('listing_delisted', 'user_old', config.schoolId, '已下架商品', '保留', 500, '其他', 'good', '江湾校区', null, 'DELISTED', 1);
    db.prepare('INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?)')
      .run('trade_cancelled', 'listing_delisted', 'user_buyer', 'user_old', config.schoolId, 2, 'CANCELLED', 500, '已下架商品');
  }
  db.prepare('INSERT INTO messages VALUES(?,?,?,?,?)').run('message_old', 'trade_old', 'user_buyer', '原有聊天内容', 3);
  for (const [id, productId] of [[imageId, 'listing_old'], [avatarId, null]]) {
    db.prepare('INSERT INTO product_images VALUES(?,?,?,?,?,?,?)').run(id!, 'user_old', productId!, 'image/png', 'png', imageBytes.length, 1);
    writeFileSync(join(config.uploadDir, `${id}.png`), imageBytes);
  }
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(avatarId, 'user_old');
  db.prepare('INSERT INTO agent_sessions VALUES(?,?,?)').run('session_old', 'user_old', 1);
  db.prepare('INSERT INTO agent_turns(session_id,request_id,question,response_json,created_at) VALUES(?,?,?,?,?)')
    .run('session_old', 'request_old', '原有找货问题', '{"reply":"原有回复"}', 1);
  db.prepare('INSERT INTO user_preferences VALUES(?,?,?,?)').run('user_old', '["教材"]', '["江湾校区"]', 3000);
  db.prepare('INSERT INTO idempotency_records VALUES(?,?,?,?,?,?)').run('synthetic', 'user_old', 'old-key', 'old-hash', '{}', 1);
  if (layout === 'registration-v4') {
    db.exec(`CREATE TABLE auth_captchas(id TEXT PRIMARY KEY,client_ip TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE INDEX auth_captchas_expiry ON auth_captchas(expires_at);
      CREATE TABLE auth_registration_limits(scope TEXT NOT NULL,key TEXT NOT NULL,count INTEGER NOT NULL,until_at INTEGER NOT NULL,PRIMARY KEY(scope,key));
      CREATE INDEX auth_registration_limits_expiry ON auth_registration_limits(until_at);
      CREATE TABLE registration_consents(user_id TEXT PRIMARY KEY REFERENCES users(id),agreement_version TEXT NOT NULL,
        privacy_version TEXT NOT NULL,accepted_at INTEGER NOT NULL);`);
    db.prepare('INSERT INTO registration_consents VALUES(?,?,?,?)').run('user_old', 'earlier-accepted-version', 'earlier-accepted-version', 1);
    db.prepare('INSERT INTO auth_registration_limits VALUES(?,?,?,?)').run('registration_ip', '203.0.113.8', 3, Date.now() + 60_000);
    db.prepare('INSERT INTO auth_captchas VALUES(?,?,?,?)').run('old_captcha', '203.0.113.8', 'preserved-hash', Date.now() + 60_000);
  }
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map(row => row.name);
  const rows = new Map(tables.map(name => [name, db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all()]));
  db.close();
  return { config, rows };
}

for (const layout of ['v3', 'marketplace-v4', 'registration-v4'] as const) {
  test(`${layout} 升级 v5 保留全部业务行、图片、原会话及协议，并可注册、取消与下架`, async () => {
    const { config, rows } = await legacyFixture(layout);
    let db = openDatabase(config);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 5);
      assert.equal(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      for (const [table, before] of rows) assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(), before, table);
      for (const id of [imageId, avatarId]) assert.deepEqual(readFileSync(join(config.uploadDir, `${id}.png`)), imageBytes);
      const store = new Store(db, config), owner = store.authenticate('preserved-token'), buyer = store.findUser('user_buyer')!;
      assert.equal(owner.id, 'user_old');
      assert.equal(store.transition('trade_old', buyer, 'cancel').status, 'CANCELLED');
      assert.equal(store.delistProduct('listing_old', owner).status, 'DELISTED');
      assert.equal(db.prepare('SELECT content FROM messages WHERE id=?').get('message_old')!.content, '原有聊天内容');
      const registration = await store.register({ email: 'new@example.com', password: 'Campus123',
        agreementVersion: AGREEMENT_VERSION, privacyVersion: PRIVACY_VERSION }, '203.0.113.9');
      assert(registration.token);
      db.close(); db = openDatabase(config);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 3);
      assert.equal(new Store(db, config).authenticate('preserved-token').id, 'user_old');
      assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get('listing_old')!.status, 'DELISTED');
      assert.equal(db.prepare('SELECT status FROM transactions WHERE id=?').get('trade_old')!.status, 'CANCELLED');
    } finally { db.close(); }
  });
}
