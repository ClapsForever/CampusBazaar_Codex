import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { cleanupExpiredData, DATA_RETENTION_MS } from '../src/retention.js';
import { pruneManagedBackups } from '../src/retention-backups.js';
import { createApiApp } from '../src/server.js';
import { Store } from '../src/store.js';

const now = Date.UTC(2026, 9, 31, 12), cutoff = now - DATA_RETENTION_MS;
const imageId = (digit: string) => `img_${digit.repeat(32)}`;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'campus-one-year-retention-'));
  const config: Config = { mode: 'local', host: '127.0.0.1', port: 0,
    databasePath: join(root, 'db.sqlite'), uploadDir: join(root, 'uploads'),
    publicBaseUrl: 'http://127.0.0.1:0', sessionSecret: 'isolated-retention-test-session-secret',
    agentBaseUrl: 'http://127.0.0.1:1', agentServiceToken: 'isolated-retention-token-a',
    internalAgentToken: 'isolated-retention-token-b', schoolId: 'school_demo' };
  const db = openDatabase(config);
  function user(id: string, created = now) {
    db.prepare(`INSERT INTO users(id,email,phone,nickname,avatar,school_id,created_at,password_hash,email_verified_at)
      VALUES(?,?,?,?,'','school_demo',?,'hash',?)`).run(id, `${id}@example.com`, `phone-${id}`, `name-${id}`, created, created);
  }
  function product(id: string, owner = 'fresh', created = now) {
    db.prepare(`INSERT INTO products VALUES(?,?,'school_demo',?,'private description',100,'教材','good','江湾校区',NULL,'ACTIVE',?)`)
      .run(id, owner, `title-${id}`, created);
  }
  function trade(id: string, productId: string, created = now) {
    db.prepare(`INSERT INTO transactions VALUES(?,?,'buyer','fresh','school_demo',?,'PENDING',100,'snapshot')`)
      .run(id, productId, created);
  }
  function image(id: string, created = now, productId: string | null = null, owner = 'fresh') {
    db.prepare('INSERT INTO product_images VALUES(?,?,?,?,?,?,?)').run(id, owner, productId, 'image/png', 'png', 5, created);
    writeFileSync(join(config.uploadDir, `${id}.png`), 'image');
  }
  return { root, config, db, user, product, trade, image };
}

test('365天精确边界：删除过期业务内容和图片，保留仅差1毫秒的新记录', () => {
  const f = fixture();
  try {
    f.user('fresh'); f.user('buyer'); f.user('expired', cutoff); f.user('edge', cutoff + 1);
    f.product('old', 'fresh', cutoff); f.product('new', 'fresh', cutoff + 1);
    f.image(imageId('a'), cutoff, 'old'); f.image(imageId('b'), cutoff + 1, 'new');
    f.image(imageId('c'), cutoff);
    f.db.prepare('UPDATE users SET avatar=? WHERE id=?').run(imageId('c'), 'fresh');
    const report = cleanupExpiredData(f.db, f.config, now);
    assert.equal(report.filesDeleted, 2);
    assert.equal(f.db.prepare('SELECT 1 FROM products WHERE id=?').get('old'), undefined);
    assert.equal(f.db.prepare('SELECT 1 FROM users WHERE id=?').get('expired'), undefined);
    assert.equal(f.db.prepare('SELECT email FROM users WHERE id=?').get('edge')!.email, 'edge@example.com');
    assert.equal(f.db.prepare('SELECT title FROM products WHERE id=?').get('new')!.title, 'title-new');
    assert.equal(f.db.prepare('SELECT avatar FROM users WHERE id=?').get('fresh')!.avatar, '');
    assert(!existsSync(join(f.config.uploadDir, `${imageId('a')}.png`)));
    assert(existsSync(join(f.config.uploadDir, `${imageId('b')}.png`)));
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(cleanupExpiredData(f.db, f.config, now).filesDeleted, 0);
  } finally { f.db.close(); }
});

test('旧父记录有新交易/消息/图片时先抹除旧内容；新内容仍可读取，最后引用到期再删除标识', () => {
  const f = fixture();
  try {
    f.user('fresh'); f.user('buyer'); f.user('expired', cutoff);
    f.product('parent', 'fresh', cutoff); f.trade('recent-trade', 'parent', cutoff + 1);
    f.product('thread-product'); f.trade('old-thread', 'thread-product', cutoff);
    f.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?)').run('recent-message', 'old-thread', 'buyer', 'recent text', cutoff + 1);
    f.product('recent-from-old-owner', 'expired', cutoff + 1);
    f.image(imageId('a'), cutoff + 1, null, 'expired');
    cleanupExpiredData(f.db, f.config, now);
    assert.equal(f.db.prepare('SELECT title,description FROM products WHERE id=?').get('parent')!.description, '');
    assert.equal(f.db.prepare('SELECT title_snapshot FROM transactions WHERE id=?').get('recent-trade')!.title_snapshot, 'snapshot');
    assert.equal(f.db.prepare('SELECT title_snapshot FROM transactions WHERE id=?').get('old-thread')!.title_snapshot, '');
    assert.equal(f.db.prepare('SELECT content FROM messages WHERE id=?').get('recent-message')!.content, 'recent text');
    const expired = f.db.prepare('SELECT * FROM users WHERE id=?').get('expired')!;
    assert.equal(expired.email, null); assert.equal(expired.phone, null); assert.equal(expired.password_hash, null);
    assert.equal(expired.nickname, '已过期用户'); assert.equal(expired.enabled, 0);
    assert.equal(f.db.prepare('SELECT description FROM products WHERE id=?').get('recent-from-old-owner')!.description, 'private description');
    assert(existsSync(join(f.config.uploadDir, `${imageId('a')}.png`)));
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
    cleanupExpiredData(f.db, f.config, now + DATA_RETENTION_MS + 1);
    for (const table of ['users','products','transactions','messages','product_images']) {
      assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0, table);
    }
  } finally { f.db.close(); }
});

test('AI逐轮过期、同意与幂等按各自时间过期，安全凭据仍按更短期限删除', () => {
  const f = fixture();
  try {
    f.user('fresh'); f.user('expired', cutoff);
    f.db.prepare('INSERT INTO agent_sessions VALUES(?,?,?)').run('session_mixed', 'fresh', cutoff);
    const turn = f.db.prepare('INSERT INTO agent_turns(session_id,request_id,question,response_json,created_at) VALUES(?,?,?,?,?)');
    turn.run('session_mixed', 'old', 'old question', '{}', cutoff);
    turn.run('session_mixed', 'recent', 'recent question', '{}', cutoff + 1);
    f.db.prepare('INSERT INTO idempotency_records VALUES(?,?,?,?,?,?)').run('s','fresh','old','h','{}',cutoff);
    f.db.prepare('INSERT INTO idempotency_records VALUES(?,?,?,?,?,?)').run('s','fresh','new','h','{}',cutoff + 1);
    f.db.prepare('INSERT INTO registration_consents VALUES(?,?,?,?)').run('fresh','v','v',cutoff);
    f.db.prepare('INSERT INTO user_preferences VALUES(?,?,?,?)').run('expired','[]','[]',null);
    f.db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,NULL)').run('expired-session','fresh','hash1',now);
    f.db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,NULL)').run('live-session','fresh','hash2',now + 1);
    f.db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,NULL)').run('old-owner-session','expired','hash3',now + 10000);
    f.db.prepare('INSERT INTO auth_login_attempts VALUES(?,?,?,?)').run('email','expired@example.com',1,now + 1000);
    cleanupExpiredData(f.db, f.config, now);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM agent_turns').get()!.n,1);
    assert.equal(f.db.prepare('SELECT question FROM agent_turns').get()!.question,'recent question');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get()!.n,1);
    assert.equal(f.db.prepare('SELECT key FROM idempotency_records').get()!.key,'new');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM registration_consents').get()!.n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM user_preferences').get()!.n,0);
    assert.equal(f.db.prepare('SELECT id FROM auth_sessions').get()!.id,'live-session');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_login_attempts').get()!.n,0);
  } finally { f.db.close(); }
});

test('预览完全回滚，不删除文件；异常时整批数据库清理回滚', () => {
  const f = fixture();
  try {
    f.user('fresh'); f.product('old', 'fresh', cutoff); f.image(imageId('a'), cutoff);
    const before = f.db.prepare('SELECT * FROM products').all();
    assert.equal(cleanupExpiredData(f.db, f.config, now, true).removed.products,1);
    assert.deepEqual(f.db.prepare('SELECT * FROM products').all(),before);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM retention_file_deletions').get()!.n,0);
    assert(existsSync(join(f.config.uploadDir, `${imageId('a')}.png`)));
    f.db.exec(`CREATE TRIGGER fail_product_cleanup BEFORE DELETE ON products BEGIN SELECT RAISE(ABORT,'simulated failure'); END;`);
    assert.throws(() => cleanupExpiredData(f.db, f.config, now), /simulated failure/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM product_images').get()!.n,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM retention_file_deletions').get()!.n,0);
    assert(existsSync(join(f.config.uploadDir, `${imageId('a')}.png`)));
  } finally { f.db.close(); }
});

test('文件删除失败持久化重试；未知文件及未到期孤儿不删除，过期孤儿才清理', () => {
  const f = fixture();
  try {
    f.user('fresh');
    f.db.prepare('INSERT INTO product_images VALUES(?,?,?,?,?,?,?)').run(imageId('a'),'fresh',null,'image/png','png',5,cutoff);
    const blocked = join(f.config.uploadDir, `${imageId('a')}.png`); mkdirSync(blocked);
    writeFileSync(join(f.config.uploadDir, 'keep.txt'),'outside image inventory');
    const orphan = join(f.config.uploadDir, `${imageId('b')}.png`); writeFileSync(orphan,'old orphan'); utimesSync(orphan,new Date(cutoff),new Date(cutoff));
    const recentOrphan = join(f.config.uploadDir, `${imageId('c')}.png`); writeFileSync(recentOrphan,'new orphan');
    assert.equal(cleanupExpiredData(f.db, f.config, now).fileFailures,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM retention_file_deletions').get()!.n,1);
    assert(!existsSync(orphan)); assert(existsSync(recentOrphan));
    rmdirSync(blocked); writeFileSync(blocked,'retry after restart');
    assert.equal(cleanupExpiredData(f.db, f.config, now).filesDeleted,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM retention_file_deletions').get()!.n,0);
    assert.equal(readFileSync(join(f.config.uploadDir,'keep.txt'),'utf8'),'outside image inventory');
  } finally { f.db.close(); }
});

test('待删除队列拒绝路径穿越，并保留恢复后仍被引用的图片', () => {
  const f = fixture();
  try {
    f.user('fresh'); f.image(imageId('a'));
    const outside = join(f.root,'outside.txt'); writeFileSync(outside,'keep');
    f.db.prepare('INSERT INTO retention_file_deletions VALUES(?,?)').run('../outside.txt',now);
    f.db.prepare('INSERT INTO retention_file_deletions VALUES(?,?)').run(`${imageId('a')}.png`,now);
    assert.equal(cleanupExpiredData(f.db,f.config,now).fileFailures,1);
    assert(existsSync(outside)); assert(existsSync(join(f.config.uploadDir,`${imageId('a')}.png`)));
  } finally { f.db.close(); }
});

test('只清理指定目录的已到期受管理备份，不触碰普通目录、未到期备份或正式数据', () => {
  const f = fixture();
  try {
    const root = join(f.root,'backups'); mkdirSync(root);
    function bundle(name: string, expiresAt: number, managed = true, extra = false) {
      const folder=join(root,name); mkdirSync(folder); mkdirSync(join(folder,'data'));
      writeFileSync(join(folder,'data','campusbazaar.sqlite'),'synthetic');
      writeFileSync(join(folder,'manifest.json'),JSON.stringify({format:1,
        ...(managed?{retention:{kind:'one-year-v1',expiresAt}}:{}),files:[{path:'data/campusbazaar.sqlite'}]}));
      if (extra) writeFileSync(join(folder,'unexpected.txt'),'do not delete');
      return folder;
    }
    const old=bundle('expired',now), fresh=bundle('fresh',now+1), unknown=bundle('unmanaged',0,false), invalid=bundle('invalid',0,true,true);
    assert.deepEqual(pruneManagedBackups(root,f.config,now),{deleted:1,failures:1});
    assert(!existsSync(old)); for(const path of [fresh,unknown,invalid]) assert(existsSync(path));
    const interrupted = bundle('interrupted', now);
    const marker = join(interrupted, 'manifest.json');
    const manifest = JSON.parse(readFileSync(marker, 'utf8'));
    manifest.retention.deleting = true;
    writeFileSync(marker, JSON.stringify(manifest));
    unlinkSync(join(interrupted, 'data', 'campusbazaar.sqlite'));
    assert.deepEqual(pruneManagedBackups(root,f.config,now),{deleted:1,failures:1});
    assert(!existsSync(interrupted));
    assert.throws(()=>pruneManagedBackups(f.root,f.config,now),/overlaps/);
    assert(existsSync(f.config.databasePath));
  } finally { f.db.close(); }
});

test('服务启动会自动清理；配置关闭时不清理；过期账号的迟到写入不能恢复资料或AI历史', async () => {
  const f=fixture();
  f.user('fresh'); f.user('expired',1); f.product('old','fresh',1);
  const stale = new Store(f.db,f.config).findUser('expired')!;
  f.db.close();
  let app=createApiApp({...f.config,retentionEnabled:false});
  assert(app.db.prepare('SELECT 1 FROM products WHERE id=?').get('old'));
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve)); await app.close();
  app=createApiApp(f.config);
  assert.equal(app.db.prepare('SELECT 1 FROM products WHERE id=?').get('old'),undefined);
  const store=new Store(app.db,f.config);
  assert.throws(()=>store.updateProfile(stale,{nickname:'resurrect'}),{status:401});
  assert.throws(()=>store.saveAgentTurn('session_late',stale,'late',{}),{status:401});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve)); await app.close();
});
