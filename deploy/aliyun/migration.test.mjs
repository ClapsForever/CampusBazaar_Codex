import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { prepareConfig } from './prepare-config.mjs';
import { restoreData, snapshotData, verifyData } from './data-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
function directory() { return mkdtempSync(join(tmpdir(), 'campus-aliyun-')); }
function execute(script, args = []) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(here, script), ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', status => resolveResult({ status, stdout, stderr }));
  });
}

test('新环境保留会话密钥与学校，内部令牌配对，HTTPS代理包含匿名注册和内部路径保护', () => {
  const root = directory(), oldApi = join(root, 'old-api.env'), oldAgent = join(root, 'old-agent.env');
  const session = 'synthetic-only-session-secret-for-migration-tests';
  writeFileSync(oldApi, `SESSION_SECRET=${session}\nAGENT_SCHOOL_ID=school_preserved\nHOST=0.0.0.0\n`);
  writeFileSync(oldAgent, 'MODEL_API_KEY=synthetic-model-key\nMODEL_NAME=deepseek-chat\n');
  const output = join(root, 'prepared');
  const report = prepareConfig({ output, publicBaseUrl: 'https://api.example.com', previousApiEnv: oldApi, previousAgentEnv: oldAgent });
  const api = parseEnv(readFileSync(join(output, 'env/api.env'), 'utf8')), agent = parseEnv(readFileSync(join(output, 'env/agent.env'), 'utf8'));
  assert.equal(api.SESSION_SECRET, session); assert.equal(api.AGENT_SCHOOL_ID, 'school_preserved');
  assert.equal(api.AGENT_SERVICE_TOKEN, agent.SERVICE_AUTH_TOKEN); assert.equal(api.INTERNAL_AGENT_TOKEN, agent.BUSINESS_BACKEND_TOKEN);
  assert.notEqual(api.AGENT_SERVICE_TOKEN, api.INTERNAL_AGENT_TOKEN);
  assert.equal(api.PUBLIC_BASE_URL, 'https://api.example.com'); assert.equal(api.HOST, '127.0.0.1');
  assert.equal(agent.MODEL_API_KEY, 'synthetic-model-key'); assert.equal(api.APP_MODE, 'local');
  assert.equal(report.sessionSecretPreserved, true);
  const nginx = readFileSync(join(output, 'nginx.conf'), 'utf8');
  assert.match(nginx, /listen 443 ssl/); assert.match(nginx, /api\.example\.com\/fullchain.pem/);
  assert.match(nginx, /location = \/api\/v1\/auth\/registrations/); assert.match(nginx, /location \^~ \/internal\//);
  assert.match(nginx, /X-Real-IP \$remote_addr/); assert.match(nginx, /X-User-Id ""/);
  assert(!nginx.includes(session)); assert(!JSON.stringify(report).includes(session));
  assert.throws(() => prepareConfig({ output, publicBaseUrl: 'https://api.example.com' }), /already exists/);
  assert.match(readFileSync(oldApi, 'utf8'), /HOST=0.0.0.0/);
});

test('配置拒绝隐式明文、带凭据或路径的入口及无效旧密钥，CLI不打印密钥', async () => {
  const root = directory();
  for (const url of ['http://api.example.com', 'https://u:password@api.example.com', 'https://api.example.com/api', 'https://api.example.com?key=value', 'https://api.example.com:80']) {
    assert.throws(() => prepareConfig({ output: join(root, 'invalid'), publicBaseUrl: url }));
    assert(!existsSync(join(root, 'invalid')));
  }
  const oldApi = join(root, 'old.env'); writeFileSync(oldApi, 'SESSION_SECRET=short\n');
  assert.throws(() => prepareConfig({ output: join(root, 'invalid'), publicBaseUrl: 'https://api.example.com', previousApiEnv: oldApi }), /no usable/);
  const output = join(root, 'http-test');
  assert.equal(prepareConfig({ output, publicBaseUrl: 'http://203.0.113.1', allowHttpTest: true }).requiresCertificate, false);
  const result = await execute('prepare-config.mjs', ['--output', join(root, 'cli'), '--public-base-url', 'https://api.example.com']);
  assert.equal(result.status, 0, result.stderr);
  const api = parseEnv(readFileSync(join(root, 'cli/env/api.env'), 'utf8'));
  assert(!result.stdout.includes(api.SESSION_SECRET)); assert(!result.stdout.includes(api.AGENT_SERVICE_TOKEN));
});

async function snapshotFixture() {
  const root = directory(), source = join(root, 'source'); mkdirSync(source); mkdirSync(join(source, 'uploads'));
  const database = join(source, 'campusbazaar.sqlite'), db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,password_hash TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT REFERENCES users(id));
    CREATE TABLE product_images(id TEXT PRIMARY KEY,extension TEXT,product_id TEXT REFERENCES products(id));
    CREATE TABLE transactions(id TEXT PRIMARY KEY,product_id TEXT REFERENCES products(id));
    CREATE TABLE messages(id TEXT PRIMARY KEY,transaction_id TEXT REFERENCES transactions(id),content TEXT);
    CREATE TABLE agent_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id));
    CREATE TABLE agent_turns(id INTEGER PRIMARY KEY,session_id TEXT REFERENCES agent_sessions(id),question TEXT);
    CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),preferences TEXT);
    CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id));
    CREATE TABLE registration_consents(user_id TEXT PRIMARY KEY REFERENCES users(id),privacy_version TEXT);
    INSERT INTO users VALUES('user_1','synthetic@example.invalid','original-scrypt-hash');
    INSERT INTO products VALUES('listing_1','user_1');
    INSERT INTO product_images VALUES('img_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','png','listing_1');
    INSERT INTO transactions VALUES('trade_1','listing_1');
    INSERT INTO messages VALUES('msg_1','trade_1','原有聊天消息');
    INSERT INTO agent_sessions VALUES('session_1','user_1');
    INSERT INTO agent_turns VALUES(1,'session_1','原有找货记录');
    INSERT INTO user_preferences VALUES('user_1','{}');
    INSERT INTO auth_sessions VALUES('auth_1','user_1');
    INSERT INTO registration_consents VALUES('user_1','earlier-version');
    PRAGMA user_version=3;`);
  writeFileSync(join(source, 'uploads/img_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'), 'synthetic image bytes');
  writeFileSync(join(source, 'uploads/unattached.png'), 'preserve unattached images too');
  const bundle = join(root, 'bundle');
  await snapshotData({ database, uploads: join(source, 'uploads'), output: bundle, apiStopped: true });
  return { root, source, database, bundle, db };
}

test('数据快照包含WAL、账号、图片、交易消息和AI历史，恢复不修改密码或旧数据', async () => {
  const f = await snapshotFixture();
  try {
    const report = verifyData(f.bundle);
    assert.equal(report.schema, 3); assert.equal(report.counts.messages, 1); assert.equal(report.counts.agent_turns, 1);
    const restored = join(f.root, 'restored'); restoreData({ bundle: f.bundle, destination: restored });
    const db = new DatabaseSync(join(restored, 'campusbazaar.sqlite'), { readOnly: true });
    try {
      assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash, 'original-scrypt-hash');
      assert.equal(db.prepare('SELECT content FROM messages').get().content, '原有聊天消息');
      assert.equal(db.prepare('SELECT question FROM agent_turns').get().question, '原有找货记录');
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
    } finally { db.close(); }
    assert.equal(readFileSync(join(restored, 'uploads/unattached.png'), 'utf8'), 'preserve unattached images too');
    assert.throws(() => restoreData({ bundle: f.bundle, destination: restored }), /already exists/);
    await assert.rejects(snapshotData({ database: f.database, uploads: join(f.source, 'uploads'), output: join(f.root, 'unsafe') }), /Stop API/);
    await assert.rejects(snapshotData({ database: f.database, uploads: join(f.source, 'uploads'), output: join(f.source, 'nested'), apiStopped: true }), /outside/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  } finally { f.db.close(); }
});

test('损坏文件、额外文件与路径穿越在恢复前被拒绝，目标目录不创建', async () => {
  const f = await snapshotFixture();
  try {
    const image = join(f.bundle, 'data/uploads/unattached.png'), original = readFileSync(image);
    writeFileSync(image, 'corrupted');
    assert.throws(() => restoreData({ bundle: f.bundle, destination: join(f.root, 'rejected') }), /checksum/);
    assert(!existsSync(join(f.root, 'rejected'))); writeFileSync(image, original);
    const manifestPath = join(f.bundle, 'manifest.json'), originalManifest = readFileSync(manifestPath);
    const manifest = JSON.parse(originalManifest); manifest.files[0].path = 'data/../outside';
    writeFileSync(manifestPath, JSON.stringify(manifest)); assert.throws(() => verifyData(f.bundle), /Unsafe/);
    writeFileSync(manifestPath, originalManifest);
    writeFileSync(join(f.bundle, 'unexpected-secret.env'), 'synthetic');
    assert.throws(() => verifyData(f.bundle), /Unlisted/);
  } finally { f.db.close(); }
});

test('缺失数据库引用图片不能生成可用迁移包', async () => {
  const f = await snapshotFixture();
  try {
    const empty = join(f.root, 'empty-uploads'); mkdirSync(empty);
    await assert.rejects(snapshotData({ database: f.database, uploads: empty, output: join(f.root, 'incomplete'), apiStopped: true }), /missing/);
    assert(!existsSync(join(f.root, 'incomplete/manifest.json')));
  } finally { f.db.close(); }
});

test('源码发布包按白名单生成，不带运行密钥、数据库或已安装依赖', async () => {
  const output = join(directory(), 'source');
  const result = await execute('prepare-release.mjs', ['--output', output]);
  assert.equal(result.status, 0, result.stderr);
  const files = readFileSync(join(output, 'source-files.txt'), 'utf8').trim().split('\n');
  assert(files.includes('backend/api/src/registration.ts')); assert(files.includes('backend/agent/package-lock.json'));
  assert(files.every(name => !/(^|\/)(node_modules|dist|\.local-data|results)\//.test(name)));
  assert(files.every(name => !/(^|\/)\.env$/.test(name)));
  const metadata = JSON.parse(readFileSync(join(output, 'release.json')));
  assert.equal(metadata.sha256, createHash('sha256').update(readFileSync(join(output, metadata.archive))).digest('hex'));
  assert.equal(metadata.secretsIncluded, false); assert.equal(metadata.dataIncluded, false);
  assert.equal(metadata.apiSchema, 5); assert.equal(metadata.legalVersion, '2026-10-18-draft-3');
  assert(!readFileSync(join(output, 'source/deploy/ubuntu/backup.sh'), 'utf8').includes('\r'));
  assert.equal((await execute('prepare-release.mjs', ['--output', output])).status, 1);
});

test('真实v5数据库可快照恢复，保留取消下架状态、协议、会话、图片与超过十段AI历史', async () => {
  const { openDatabase } = await import(pathToFileURL(join(repo, 'backend/api/dist/src/db.js')));
  const { Store } = await import(pathToFileURL(join(repo, 'backend/api/dist/src/store.js')));
  const root = directory(), source = join(root, 'live-data');
  const config = { mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(source, 'campusbazaar.sqlite'),
    uploadDir: join(source, 'uploads'), publicBaseUrl: 'http://127.0.0.1:0',
    sessionSecret: 'synthetic-v5-backup-session-secret', agentBaseUrl: 'http://127.0.0.1:1',
    agentServiceToken: 'synthetic-v5-agent-token-a', internalAgentToken: 'synthetic-v5-internal-token-b', schoolId: 'school_backup' };
  const db = openDatabase(config), store = new Store(db, config);
  try {
    const register = email => store.register({ email, password: 'Campus123',
      agreementVersion: '2026-10-18-draft-3', privacyVersion: '2026-10-18-draft-3' }, '203.0.113.15');
    const seller = await register('seller@example.invalid'), buyer = await register('buyer@example.invalid');
    const owner = store.findUser(seller.user.id), customer = store.findUser(buyer.user.id);
    const image = 'img_cccccccccccccccccccccccccccccccc', bytes = Buffer.from('synthetic backup image');
    db.prepare('INSERT INTO product_images(id,owner_id,product_id,mime,extension,size_bytes,created_at) VALUES(?,?,NULL,?,?,?,?)')
      .run(image, owner.id, 'image/png', 'png', bytes.length, Date.now());
    writeFileSync(join(config.uploadDir, `${image}.png`), bytes);
    const product = store.publish(owner, { title: '迁移教材', description: '合成数据', price: 20, imageIds: [image] });
    const trade = store.createTransaction(customer, { productId: product.id });
    store.transition(trade.id, customer, 'cancel'); store.delistProduct(product.id, owner);
    for (let index = 0; index < 12; index++) store.saveAgentTurn(`session_backup_${index}`, owner, '保留问题', { requestId: `request_${index}` });
    const bundle = join(root, 'bundle-v5');
    const snapshot = await snapshotData({ database: config.databasePath, uploads: config.uploadDir, output: bundle, apiStopped: true });
    assert.equal(snapshot.schema, 5); assert.equal(snapshot.counts.agent_sessions, 12);
    const restored = join(root, 'restored-v5'); restoreData({ bundle, destination: restored });
    const restoredDb = openDatabase({ ...config, databasePath: join(restored, 'campusbazaar.sqlite'), uploadDir: join(restored, 'uploads') });
    try {
      assert.equal(new Store(restoredDb, config).authenticate(seller.token).id, owner.id);
      assert.equal(restoredDb.prepare('SELECT status FROM products WHERE id=?').get(product.id).status, 'DELISTED');
      assert.equal(restoredDb.prepare('SELECT status FROM transactions WHERE id=?').get(trade.id).status, 'CANCELLED');
      assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get().n, 12);
      assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM registration_consents').get().n, 2);
      assert.deepEqual(readFileSync(join(restored, 'uploads', `${image}.png`)), bytes);
      assert.deepEqual(restoredDb.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { restoredDb.close(); }
  } finally { db.close(); }
});

test('部署探针识别旧后端401，并在显式选择时验证真实新版API的注册与重登', async () => {
  const { createApiApp } = await import(pathToFileURL(join(repo, 'backend/api/dist/src/server.js')));
  const root = directory();
  const app = createApiApp({ mode: 'local', host: '127.0.0.1', port: 0, databasePath: join(root, 'smoke.sqlite'), uploadDir: join(root, 'uploads'),
    publicBaseUrl: 'http://127.0.0.1:0', sessionSecret: 'synthetic-aliyun-smoke-session-secret', agentBaseUrl: 'http://127.0.0.1:1',
    agentServiceToken: 'test-agent-service-token-a', internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_smoke' });
  await new Promise(resolveStart => app.server.listen(0, '127.0.0.1', resolveStart));
  let legacy = true;
  const proxy = createServer(async (req, res) => {
    if (req.url.startsWith('/internal/')) { res.writeHead(404); res.end('{}'); return; }
    if (legacy && req.url === '/api/v1/auth/registrations') { res.writeHead(401); res.end('{"code":"UNAUTHORIZED"}'); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}${req.url}`, { method: req.method,
      headers: { 'content-type': 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
      ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
    res.writeHead(response.status, { 'content-type': 'application/json' }); res.end(await response.text());
  });
  await new Promise(resolveStart => proxy.listen(0, '127.0.0.1', resolveStart));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  try {
    const old = await execute('smoke.mjs', ['--base-url', base]); assert.equal(old.status, 1); assert.match(old.stderr, /HTTP 401/);
    legacy = false;
    const readOnly = await execute('smoke.mjs', ['--base-url', base]); assert.equal(readOnly.status, 0, readOnly.stderr);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    const real = await execute('smoke.mjs', ['--base-url', base, '--registration-test']); assert.equal(real.status, 0, real.stderr);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL').get().n, 0);
  } finally { await new Promise(resolveClose => proxy.close(resolveClose)); await app.close(); }
});
