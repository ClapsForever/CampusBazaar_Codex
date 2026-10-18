import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.js';

export function openDatabase(config: Pick<Config, 'databasePath' | 'uploadDir'>): DatabaseSync {
  mkdirSync(dirname(config.databasePath), { recursive: true });
  mkdirSync(config.uploadDir, { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  try { migrate(db); } catch (error) { db.close(); throw error; }
  return db;
}

function migrate(db: DatabaseSync): void {
  const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version.user_version > 4) throw new Error('Database schema is newer than this API');
  if (version.user_version === 4) return;
  if (version.user_version === 0) db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '', school_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, revoked_at INTEGER
    );
    CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE products (
      id TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES users(id), school_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents > 0),
      category TEXT NOT NULL, condition TEXT NOT NULL, campus TEXT NOT NULL, version TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SOLD')),
      published_at INTEGER NOT NULL
    );
    CREATE INDEX products_feed ON products(school_id,status,published_at DESC,id DESC);
    CREATE INDEX products_seller ON products(seller_id,published_at DESC,id DESC);
    CREATE TABLE product_images (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT REFERENCES products(id), mime TEXT NOT NULL, extension TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX product_images_product ON product_images(product_id);
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
      buyer_id TEXT NOT NULL REFERENCES users(id), seller_id TEXT NOT NULL REFERENCES users(id),
      school_id TEXT NOT NULL, create_time INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','REJECTED','COMPLETED')),
      price_cents INTEGER NOT NULL, title_snapshot TEXT NOT NULL
    );
    CREATE UNIQUE INDEX one_active_transaction_per_product ON transactions(product_id)
      WHERE status IN ('PENDING','ACCEPTED');
    CREATE INDEX transactions_buyer ON transactions(buyer_id,create_time DESC,id DESC);
    CREATE INDEX transactions_seller ON transactions(seller_id,create_time DESC,id DESC);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(id),
      sender_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, send_time INTEGER NOT NULL
    );
    CREATE INDEX messages_feed ON messages(transaction_id,send_time,id);
    CREATE TABLE idempotency_records (
      scope TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL,
      request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(scope,user_id,key)
    );
    CREATE TABLE agent_sessions (
      session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
    );
    CREATE TABLE user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id), favorite_categories TEXT NOT NULL DEFAULT '[]',
      preferred_campuses TEXT NOT NULL DEFAULT '[]', price_ceiling_cents INTEGER
    );
    PRAGMA user_version=1;
    COMMIT;
  `);
  if (version.user_version < 2) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE users ADD COLUMN password_hash TEXT;
    CREATE TABLE agent_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES agent_sessions(session_id),
      request_id TEXT NOT NULL, question TEXT NOT NULL, response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, UNIQUE(session_id,request_id)
    );
    CREATE INDEX agent_turns_session ON agent_turns(session_id,id);
    CREATE INDEX agent_sessions_history ON agent_sessions(user_id,created_at DESC,session_id DESC);
    PRAGMA user_version=2;
    COMMIT;
  `);

  if (version.user_version < 3) {
    // Keep every user ID and its business references; phone becomes optional.
    // Foreign keys must be disabled outside the transaction while rebuilding users.
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      transaction(db, () => {
        db.exec(`
        CREATE TABLE users_v3 (
          id TEXT PRIMARY KEY, phone TEXT UNIQUE, nickname TEXT NOT NULL,
          avatar TEXT NOT NULL DEFAULT '', school_id TEXT NOT NULL, created_at INTEGER NOT NULL,
          password_hash TEXT, email TEXT UNIQUE, email_verified_at INTEGER,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
        );
        INSERT INTO users_v3(id,phone,nickname,avatar,school_id,created_at,password_hash)
          SELECT id,phone,nickname,avatar,school_id,created_at,password_hash FROM users;
        DROP TABLE users;
        ALTER TABLE users_v3 RENAME TO users;
        CREATE TABLE auth_login_attempts (
          scope TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL, until_at INTEGER NOT NULL,
          PRIMARY KEY(scope,key)
        );
        CREATE INDEX auth_login_attempts_expiry ON auth_login_attempts(until_at);
        `);
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_sessions'").get()) {
          db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE revoked_at IS NULL').run(Date.now());
        }
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database migration failed foreign key validation');
        db.exec('PRAGMA user_version=3');
      });
    } finally {
      db.exec('PRAGMA foreign_keys=ON');
    }
  }

  transaction(db, () => {
    db.exec(`
      CREATE TABLE auth_captchas (
        id TEXT PRIMARY KEY, client_ip TEXT NOT NULL, code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX auth_captchas_expiry ON auth_captchas(expires_at);
      CREATE TABLE auth_registration_limits (
        scope TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL,
        until_at INTEGER NOT NULL, PRIMARY KEY(scope,key)
      );
      CREATE INDEX auth_registration_limits_expiry ON auth_registration_limits(until_at);
      CREATE TABLE registration_consents (
        user_id TEXT PRIMARY KEY REFERENCES users(id), agreement_version TEXT NOT NULL,
        privacy_version TEXT NOT NULL, accepted_at INTEGER NOT NULL
      );
      PRAGMA user_version=4;
    `);
  });
}

export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
