import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.js';
import { transaction } from './db.js';
import { ApiError, bodyHash, cursorDecode, cursorEncode, moneyToCents, optionalText, positiveInt, text, tokenHash } from './http.js';
import { categorySearchSpec, keywordGroups } from './search.js';
import { hashPassword, validatePassword, verifyPassword } from './password.js';
import { normalizeEmail } from './accounts.js';

type UserRow = { id: string; phone: string | null; email: string | null; enabled: number; nickname: string; avatar: string; school_id: string; password_hash: string | null };
type ProductRow = { id: string; seller_id: string; school_id: string; title: string; description: string; price_cents: number; category: string; condition: string; campus: string; version: string | null; status: 'ACTIVE' | 'SOLD'; published_at: number };
type TransactionRow = { id: string; product_id: string; buyer_id: string; seller_id: string; school_id: string; create_time: number; status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED'; price_cents: number; title_snapshot: string };
type MessageRow = { id: string; transaction_id: string; sender_id: string; content: string; send_time: number };
type ImageRow = { id: string; owner_id: string; product_id: string | null; mime: string; extension: string; size_bytes: number };

const productIdPattern = /^listing_[a-z0-9_-]{1,64}$/;
const conditions = ['new', 'like_new', 'good', 'fair', 'unknown'];

export class Store {
  constructor(public db: DatabaseSync, public config: Config) {}

  cleanupAbandonedUploads(now = Date.now()): number {
    const rows = this.db.prepare('SELECT id,extension FROM product_images WHERE product_id IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE avatar=product_images.id) AND created_at<?')
      .all(now - 86_400_000) as { id: string; extension: string }[];
    let removed = 0;
    for (const row of rows) {
      if (!/^img_[a-f0-9]{32}$/.test(row.id) || !['jpg', 'png', 'webp'].includes(row.extension)) continue;
      const filename = join(this.config.uploadDir, `${row.id}.${row.extension}`);
      if (existsSync(filename)) unlinkSync(filename);
      this.db.prepare('DELETE FROM product_images WHERE id=? AND product_id IS NULL').run(row.id);
      removed++;
    }
    return removed;
  }

  user(row: UserRow, own = false): Record<string, unknown> {
    return { id: row.id, nickname: row.nickname,
      avatar: /^img_[a-f0-9]{32}$/.test(row.avatar) ? this.imageUrl(row.avatar) : row.avatar,
      ...(own ? { email: row.email, hasPassword: !!row.password_hash } : {}) };
  }

  findUser(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined;
  }

  private issueSession(row: UserRow): { user: Record<string, unknown>; token: string; expiresAt: number } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 7 * 86_400_000;
    this.db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
      .run(`auth_${randomUUID()}`, row.id, tokenHash(token, this.config), expiresAt);
    return { user: this.user(row, true), token, expiresAt };
  }

  async loginWithPassword(body: Record<string, unknown>, clientIp = 'local') {
    const email = normalizeEmail(body.email);
    const now = Date.now();
    // Reserve attempts before asynchronous hashing: parallel requests cannot
    // bypass the budget. Persist it so restarts do not reset the limits.
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM auth_login_attempts WHERE until_at<=?').run(now);
      for (const [scope, key, maximum] of [['email', email, 5], ['ip', clientIp, 100]] as const) {
        const attempts = this.db.prepare('SELECT count FROM auth_login_attempts WHERE scope=? AND key=?').get(scope, key);
        if (attempts && Number(attempts.count) >= maximum) {
          throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请 15 分钟后重试');
        }
        this.db.prepare('INSERT INTO auth_login_attempts(scope,key,count,until_at) VALUES(?,?,1,?) ON CONFLICT(scope,key) DO UPDATE SET count=count+1')
          .run(scope, key, now + 15 * 60_000);
      }
    });
    const row = this.db.prepare('SELECT * FROM users WHERE email=?').get(email) as UserRow | undefined;
    // Derive a key for unknown accounts too; never reveal whether an account exists.
    const valid = await verifyPassword(body.password,
      row?.password_hash ?? `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if (!row?.password_hash || !row.enabled || !valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误');
    }
    // Do not issue a session if a concurrent password change revoked this credential.
    return transaction(this.db, () => {
      const fresh = this.findUser(row.id)!;
      if (!fresh || !fresh.enabled || fresh.email !== email || fresh.password_hash !== row.password_hash) throw new ApiError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误');
      this.db.prepare("DELETE FROM auth_login_attempts WHERE scope='email' AND key=?").run(email);
      return this.issueSession(fresh);
    });
  }

  updateProfile(user: UserRow, body: Record<string, unknown>): Record<string, unknown> {
    const nickname = body.nickname === undefined ? user.nickname : text(body.nickname, '昵称', 1, 24);
    const avatar = body.avatarId === undefined ? user.avatar : text(body.avatarId, '头像', 1, 100);
    if (body.avatarId !== undefined) {
      const image = this.image(avatar);
      if (!image || image.owner_id !== user.id || image.product_id) {
        throw new ApiError(403, 'IMAGE_FORBIDDEN', '请选择自己上传的头像');
      }
    }
    this.db.prepare('UPDATE users SET nickname=?,avatar=? WHERE id=?').run(nickname, avatar, user.id);
    return this.user(this.findUser(user.id)!, true);
  }

  async changePassword(user: UserRow, body: Record<string, unknown>, token: string): Promise<Record<string, unknown>> {
    const password = validatePassword(body.newPassword);
    if (!user.password_hash || !await verifyPassword(body.currentPassword, user.password_hash)) {
      throw new ApiError(401, 'INVALID_PASSWORD', '当前密码不正确');
    }
    const hash = await hashPassword(password);
    return transaction(this.db, () => {
      const fresh = this.findUser(user.id)!;
      if (fresh.password_hash !== user.password_hash) throw new ApiError(409, 'PASSWORD_CHANGED', '密码已变更，请刷新后重试');
      this.authenticate(token);
      this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
      this.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND token_hash<>? AND revoked_at IS NULL')
        .run(Date.now(), user.id, tokenHash(token, this.config));
      return this.user(this.findUser(user.id)!, true);
    });
  }

  isAvatar(id: string, schoolId?: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM users WHERE avatar=? ${schoolId ? 'AND school_id=?' : ''}`)
      .get(...(schoolId ? [id, schoolId] : [id]));
  }

  authenticate(token: string): UserRow {
    const row = this.db.prepare(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
        AND u.enabled=1 AND u.email IS NOT NULL AND u.password_hash IS NOT NULL`)
      .get(tokenHash(token, this.config), Date.now()) as UserRow | undefined;
    if (!row) throw new ApiError(401, 'UNAUTHORIZED', '登录已失效，请重新登录');
    return row;
  }

  logout(token: string): void {
    this.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL')
      .run(Date.now(), tokenHash(token, this.config));
  }

  image(id: string): ImageRow | undefined {
    return this.db.prepare('SELECT * FROM product_images WHERE id=?').get(id) as ImageRow | undefined;
  }

  imageUrl(id: string): string {
    const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = createHmac('sha256', this.config.sessionSecret).update(`${id}:${expires}`).digest('hex');
    return `${this.config.publicBaseUrl}/api/v1/images/${id}?expires=${expires}&signature=${signature}`;
  }

  validImageSignature(id: string, params: URLSearchParams): boolean {
    const expires = Number(params.get('expires'));
    const provided = params.get('signature') ?? '';
    if (!Number.isSafeInteger(expires) || expires < Date.now() / 1000 || expires > Date.now() / 1000 + 24 * 60 * 60 + 60 || !/^[a-f0-9]{64}$/.test(provided)) return false;
    const expected = createHmac('sha256', this.config.sessionSecret).update(`${id}:${expires}`).digest('hex');
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  }

  product(row: ProductRow): Record<string, unknown> {
    const images = this.db.prepare('SELECT id FROM product_images WHERE product_id=? ORDER BY created_at,id').all(row.id) as { id: string }[];
    return {
      id: row.id, title: row.title, description: row.description, price: row.price_cents / 100,
      images: images.map(item => this.imageUrl(item.id)),
      publishTime: row.published_at, sellerId: row.seller_id,
      category: row.category, condition: row.condition, campus: row.campus,
      status: row.status, version: row.version
    };
  }

  findProduct(id: string): ProductRow | undefined {
    return this.db.prepare('SELECT * FROM products WHERE id=?').get(id) as ProductRow | undefined;
  }

  publicProduct(id: string, user: UserRow): { product: Record<string, unknown>; seller: Record<string, unknown> } {
    const row = this.findProduct(id);
    if (!row || row.school_id !== user.school_id) throw new ApiError(404, 'NOT_FOUND', '商品不存在');
    const canSeeSold = row.seller_id === user.id || !!this.db.prepare('SELECT 1 FROM transactions WHERE product_id=? AND buyer_id=? LIMIT 1').get(id, user.id);
    if (row.status !== 'ACTIVE' && !canSeeSold) throw new ApiError(404, 'NOT_FOUND', '商品不存在');
    return { product: this.product(row), seller: this.user(this.findUser(row.seller_id)!) };
  }

  products(user: UserRow, params: URLSearchParams, mine = false): { items: unknown[]; nextCursor: string | null } {
    const limit = params.has('limit') ? positiveInt(params.get('limit'), 'limit', 100) : 20;
    const cursor = cursorDecode(params.get('cursor'));
    const keyword = params.get('q')?.trim() || params.get('keyword')?.trim() || '';
    if (keyword.length > 100) throw new ApiError(400, 'BAD_REQUEST', '搜索词过长');
    const where = mine ? ['seller_id=?'] : ["school_id=?", "status='ACTIVE'"];
    const args: (string | number)[] = [mine ? user.id : user.school_id];
    if (!mine) where.push("NOT EXISTS (SELECT 1 FROM transactions t WHERE t.product_id=products.id AND t.status IN ('PENDING','ACCEPTED'))");
    if (keyword) { where.push('instr(lower(title),lower(?))>0'); args.push(keyword); }
    if (cursor) { where.push('(published_at<? OR (published_at=? AND id<?))'); args.push(cursor[0], cursor[0], cursor[1]); }
    const rows = this.db.prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY published_at DESC,id DESC LIMIT ?`)
      .all(...args, limit + 1) as ProductRow[];
    const slice = rows.slice(0, limit);
    const last = slice.at(-1);
    return { items: slice.map(row => this.product(row)), nextCursor: rows.length > limit && last ? cursorEncode(last.published_at, last.id) : null };
  }

  publish(user: UserRow, body: Record<string, unknown>): Record<string, unknown> {
    const title = text(body.title, '商品名称', 1, 100);
    const description = text(body.description, '商品描述', 1, 3000);
    const priceCents = moneyToCents(body.price);
    const category = optionalText(body.category, '类别', 50) ?? '其他';
    const condition = optionalText(body.condition, '成色', 30) ?? 'unknown';
    if (!conditions.includes(condition)) throw new ApiError(400, 'BAD_REQUEST', '成色不支持');
    const campus = optionalText(body.campus, '校区', 100) ?? '未填写校区';
    const version = optionalText(body.version, '版本', 100) ?? null;
    const rawImages = body.imageIds ?? body.images ?? [];
    if (!Array.isArray(rawImages) || rawImages.length > 3 || rawImages.some(x => typeof x !== 'string') || new Set(rawImages).size !== rawImages.length) {
      throw new ApiError(400, 'BAD_REQUEST', '图片必须是最多三张不重复的上传 ID');
    }
    const imageIds = rawImages as string[];
    const id = `listing_${randomUUID().replaceAll('-', '')}`;
    const now = Date.now();
    transaction(this.db, () => {
      for (const imageId of imageIds) {
        const image = this.image(imageId);
        if (!image || image.owner_id !== user.id || image.product_id || this.isAvatar(imageId)) throw new ApiError(403, 'IMAGE_FORBIDDEN', '图片不属于当前用户或已被使用');
      }
      this.db.prepare(`INSERT INTO products(id,seller_id,school_id,title,description,price_cents,category,condition,campus,version,status,published_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'ACTIVE',?)`).run(id, user.id, user.school_id, title, description, priceCents, category, condition, campus, version, now);
      for (const imageId of imageIds) this.db.prepare('UPDATE product_images SET product_id=? WHERE id=?').run(id, imageId);
    });
    return this.product(this.findProduct(id)!);
  }

  transactionView(row: TransactionRow): Record<string, unknown> {
    return { id: row.id, productId: row.product_id, buyerId: row.buyer_id, sellerId: row.seller_id,
      createTime: row.create_time, status: row.status, priceAtPurchase: row.price_cents / 100, titleAtPurchase: row.title_snapshot };
  }

  messageView(row: MessageRow): Record<string, unknown> {
    return { id: row.id, transactionId: row.transaction_id, senderId: row.sender_id, content: row.content, sendTime: row.send_time };
  }

  findTransaction(id: string, user: UserRow): TransactionRow {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id=? AND school_id=? AND (buyer_id=? OR seller_id=?)')
      .get(id, user.school_id, user.id, user.id) as TransactionRow | undefined;
    if (!row) throw new ApiError(404, 'NOT_FOUND', '交易不存在');
    return row;
  }

  transactionDetail(id: string, user: UserRow): Record<string, unknown> {
    const row = this.findTransaction(id, user);
    return { transaction: this.transactionView(row), product: this.product(this.findProduct(row.product_id)!),
      buyer: this.user(this.findUser(row.buyer_id)!), seller: this.user(this.findUser(row.seller_id)!) };
  }

  transactions(user: UserRow, params: URLSearchParams): { items: unknown[]; nextCursor: string | null } {
    const limit = params.has('limit') ? positiveInt(params.get('limit'), 'limit', 100) : 20;
    const cursor = cursorDecode(params.get('cursor'));
    const args: (string | number)[] = [user.school_id, user.id, user.id];
    const continuation = cursor ? 'AND (create_time<? OR (create_time=? AND id<?))' : '';
    if (cursor) args.push(cursor[0], cursor[0], cursor[1]);
    const rows = this.db.prepare(`SELECT * FROM transactions WHERE school_id=? AND (buyer_id=? OR seller_id=?) ${continuation} ORDER BY create_time DESC,id DESC LIMIT ?`)
      .all(...args, limit + 1) as TransactionRow[];
    const slice = rows.slice(0, limit);
    const items = slice.map(row => {
      const other = row.buyer_id === user.id ? row.seller_id : row.buyer_id;
      const latest = this.db.prepare('SELECT * FROM messages WHERE transaction_id=? ORDER BY send_time DESC,id DESC LIMIT 1').get(row.id) as MessageRow | undefined;
      return { transaction: this.transactionView(row), product: this.product(this.findProduct(row.product_id)!),
        counterparty: this.user(this.findUser(other)!), ...(latest ? { latestMessage: this.messageView(latest) } : {}) };
    });
    const last = slice.at(-1);
    return { items, nextCursor: rows.length > limit && last ? cursorEncode(last.create_time, last.id) : null };
  }

  private replay(scope: string, userId: string, key: string | undefined, input: unknown): unknown | undefined {
    if (!key) return undefined;
    const row = this.db.prepare('SELECT request_hash,response_json FROM idempotency_records WHERE scope=? AND user_id=? AND key=?')
      .get(scope, userId, key) as { request_hash: string; response_json: string } | undefined;
    if (!row) return undefined;
    if (row.request_hash !== bodyHash(input)) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于其他请求');
    return JSON.parse(row.response_json) as unknown;
  }

  private remember(scope: string, userId: string, key: string | undefined, input: unknown, result: unknown): void {
    if (key) this.db.prepare('INSERT INTO idempotency_records VALUES(?,?,?,?,?,?)')
      .run(scope, userId, key, bodyHash(input), JSON.stringify(result), Date.now());
  }

  createTransaction(user: UserRow, body: Record<string, unknown>, key?: string): Record<string, unknown> {
    const productId = text(body.productId, '商品 ID', 1, 100);
    return transaction(this.db, () => {
      const replay = this.replay('create_transaction', user.id, key, body);
      if (replay) return replay as Record<string, unknown>;
      const product = this.findProduct(productId);
      if (!product || product.school_id !== user.school_id) throw new ApiError(404, 'NOT_FOUND', '商品不存在');
      if (product.seller_id === user.id) throw new ApiError(403, 'OWN_PRODUCT', '不能购买自己的商品');
      if (product.status !== 'ACTIVE') throw new ApiError(409, 'PRODUCT_SOLD', '商品已售出');
      const occupied = this.db.prepare("SELECT 1 FROM transactions WHERE product_id=? AND status IN ('PENDING','ACCEPTED')").get(productId);
      if (occupied) throw new ApiError(409, 'PRODUCT_OCCUPIED', '商品已有进行中的交易');
      const id = `trade_${randomUUID()}`;
      const now = Date.now();
      this.db.prepare(`INSERT INTO transactions(id,product_id,buyer_id,seller_id,school_id,create_time,status,price_cents,title_snapshot)
        VALUES(?,?,?,?,?,?,'PENDING',?,?)`).run(id, productId, user.id, product.seller_id, user.school_id, now, product.price_cents, product.title);
      const result = this.transactionView(this.findTransaction(id, user));
      this.remember('create_transaction', user.id, key, body, result);
      return result;
    });
  }

  transition(id: string, user: UserRow, action: 'accept' | 'reject' | 'complete'): Record<string, unknown> {
    const expected = action === 'complete' ? 'ACCEPTED' : 'PENDING';
    const next = { accept: 'ACCEPTED', reject: 'REJECTED', complete: 'COMPLETED' }[action];
    return transaction(this.db, () => {
      const row = this.findTransaction(id, user);
      if (row.seller_id !== user.id) throw new ApiError(403, 'FORBIDDEN', '只有卖家可以处理交易');
      if (row.status !== expected) throw new ApiError(409, 'INVALID_STATUS', '交易状态不允许此操作');
      const update = this.db.prepare('UPDATE transactions SET status=? WHERE id=? AND status=?').run(next, id, expected);
      if (update.changes !== 1) throw new ApiError(409, 'INVALID_STATUS', '交易状态已变化');
      if (next === 'COMPLETED') this.db.prepare("UPDATE products SET status='SOLD' WHERE id=? AND status='ACTIVE'").run(row.product_id);
      return this.transactionView(this.findTransaction(id, user));
    });
  }

  messages(id: string, user: UserRow, params: URLSearchParams): { items: unknown[]; nextCursor: string | null } {
    this.findTransaction(id, user);
    const limit = params.has('limit') ? positiveInt(params.get('limit'), 'limit', 100) : 50;
    const cursor = cursorDecode(params.get('cursor'));
    const args: (string | number)[] = [id];
    const continuation = cursor ? 'AND (send_time>? OR (send_time=? AND id>?))' : '';
    if (cursor) args.push(cursor[0], cursor[0], cursor[1]);
    const rows = this.db.prepare(`SELECT * FROM messages WHERE transaction_id=? ${continuation} ORDER BY send_time,id LIMIT ?`)
      .all(...args, limit + 1) as MessageRow[];
    const slice = rows.slice(0, limit);
    const last = slice.at(-1);
    return { items: slice.map(row => this.messageView(row)), nextCursor: rows.length > limit && last ? cursorEncode(last.send_time, last.id) : null };
  }

  sendMessage(id: string, user: UserRow, body: Record<string, unknown>, key?: string): Record<string, unknown> {
    const content = text(body.content, '消息', 1, 2000);
    return transaction(this.db, () => {
      const row = this.findTransaction(id, user);
      const replay = this.replay(`message:${id}`, user.id, key, body);
      if (replay) return replay as Record<string, unknown>;
      if (!['PENDING', 'ACCEPTED'].includes(row.status)) throw new ApiError(409, 'TRANSACTION_CLOSED', '交易已结束，仅可查看历史消息');
      const messageId = `msg_${randomUUID()}`;
      this.db.prepare('INSERT INTO messages(id,transaction_id,sender_id,content,send_time) VALUES(?,?,?,?,?)')
        .run(messageId, id, user.id, content, Date.now());
      const result = this.messageView(this.db.prepare('SELECT * FROM messages WHERE id=?').get(messageId) as MessageRow);
      this.remember(`message:${id}`, user.id, key, body, result);
      return result;
    });
  }

  agentSessionOwned(sessionId: string, user: UserRow): void {
    const row = this.db.prepare('SELECT user_id FROM agent_sessions WHERE session_id=?').get(sessionId) as { user_id: string } | undefined;
    if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Agent 会话不存在');
    if (row.user_id !== user.id) throw new ApiError(403, 'SESSION_FORBIDDEN', '不能使用其他用户的 Agent 会话');
  }

  rememberAgentSession(sessionId: string, user: UserRow): void {
    const row = this.db.prepare('SELECT user_id FROM agent_sessions WHERE session_id=?').get(sessionId) as { user_id: string } | undefined;
    if (row && row.user_id !== user.id) throw new ApiError(403, 'SESSION_FORBIDDEN', 'Agent 会话归属冲突');
    if (!row) this.db.prepare('INSERT INTO agent_sessions VALUES(?,?,?)').run(sessionId, user.id, Date.now());
  }

  saveAgentTurn(sessionId: string, user: UserRow, question: string, response: Record<string, unknown>): void {
    transaction(this.db, () => {
      this.rememberAgentSession(sessionId, user);
      const previous = this.db.prepare('SELECT question FROM agent_turns WHERE session_id=? AND request_id=?')
        .get(sessionId, response.requestId as string) as { question: string } | undefined;
      if (previous && previous.question !== question) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '请求编号已用于其他问题');
      if (!previous) this.db.prepare('INSERT INTO agent_turns(session_id,request_id,question,response_json,created_at) VALUES(?,?,?,?,?)')
        .run(sessionId, response.requestId as string, question, JSON.stringify(response), Date.now());
    });
  }

  agentHistory(user: UserRow, params: URLSearchParams): Record<string, unknown> {
    const limit = params.has('limit') ? positiveInt(params.get('limit'), 'limit', 100) : 20;
    const cursor = cursorDecode(params.get('cursor'));
    const rows = this.db.prepare(`SELECT s.session_id,s.created_at,
      (SELECT question FROM agent_turns WHERE session_id=s.session_id ORDER BY id LIMIT 1) AS title,
      (SELECT COUNT(*) FROM agent_turns WHERE session_id=s.session_id) AS turn_count,
      (SELECT MAX(created_at) FROM agent_turns WHERE session_id=s.session_id) AS updated_at
      FROM agent_sessions s WHERE user_id=? AND EXISTS (SELECT 1 FROM agent_turns WHERE session_id=s.session_id)
      ${cursor ? 'AND (s.created_at<? OR (s.created_at=? AND s.session_id<?))' : ''}
      ORDER BY s.created_at DESC,s.session_id DESC LIMIT ?`)
      .all(user.id, ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []), limit + 1) as {
        session_id: string; created_at: number; title: string; turn_count: number; updated_at: number
      }[];
    const slice = rows.slice(0, limit), last = slice.at(-1);
    return { items: slice.map(row => ({ sessionId: row.session_id, title: row.title,
      createdAt: row.created_at, updatedAt: row.updated_at, turnCount: row.turn_count })),
      nextCursor: rows.length > limit && last ? cursorEncode(last.created_at, last.session_id) : null };
  }

  agentHistoryTurns(user: UserRow, sessionId: string, params: URLSearchParams): Record<string, unknown> {
    this.agentSessionOwned(sessionId, user);
    const limit = params.has('limit') ? positiveInt(params.get('limit'), 'limit', 100) : 50;
    const cursor = params.has('cursor') ? positiveInt(params.get('cursor'), 'cursor', Number.MAX_SAFE_INTEGER) : 0;
    const rows = this.db.prepare('SELECT * FROM agent_turns WHERE session_id=? AND id>? ORDER BY id LIMIT ?')
      .all(sessionId, cursor, limit + 1) as { id: number; question: string; response_json: string; created_at: number }[];
    const slice = rows.slice(0, limit), last = slice.at(-1);
    return { items: slice.map(row => ({ question: row.question, createdAt: row.created_at,
      response: JSON.parse(row.response_json) as unknown })), nextCursor: rows.length > limit && last ? String(last.id) : null };
  }

  internalUser(userId: string, schoolId: string): UserRow {
    const row = this.findUser(userId);
    if (!row || row.school_id !== schoolId) throw new ApiError(403, 'FORBIDDEN', '用户或学校范围无效');
    return row;
  }

  listing(row: ProductRow, detail = false): Record<string, unknown> {
    const firstImage = this.db.prepare('SELECT id FROM product_images WHERE product_id=? ORDER BY created_at,id LIMIT 1').get(row.id) as { id: string } | undefined;
    const base: Record<string, unknown> = {
      listingId: row.id, title: row.title, category: row.category, priceCents: row.price_cents,
      condition: row.condition, campus: row.campus, description: row.description,
      status: 'active', schoolId: row.school_id
    };
    if (firstImage) base.imageUrl = this.imageUrl(firstImage.id);
    if (detail) {
      base.sellerLabel = this.findUser(row.seller_id)!.nickname;
      base.publishedAt = new Date(row.published_at).toISOString();
      if (row.version) base.version = row.version;
    }
    return base;
  }

  internalListing(id: string, user: UserRow): Record<string, unknown> {
    if (!productIdPattern.test(id)) throw new ApiError(400, 'BAD_REQUEST', 'listingId 格式不正确');
    const row = this.findProduct(id);
    if (!row || row.school_id !== user.school_id || row.status !== 'ACTIVE') throw new ApiError(404, 'NOT_FOUND', '商品不存在');
    const occupied = this.db.prepare("SELECT 1 FROM transactions WHERE product_id=? AND status IN ('PENDING','ACCEPTED')").get(id);
    if (occupied) throw new ApiError(404, 'NOT_FOUND', '商品暂不可购买');
    return this.listing(row, true);
  }

  internalSearch(user: UserRow, params: URLSearchParams): Record<string, unknown> {
    const page = params.has('page') ? positiveInt(params.get('page'), 'page', 10000) : 1;
    const pageSize = params.has('pageSize') ? positiveInt(params.get('pageSize'), 'pageSize', 10) : 10;
    const hard: Record<string, unknown> = {};
    const soft: Record<string, unknown> = {};
    const where = ["p.school_id=?", "p.status='ACTIVE'", "NOT EXISTS (SELECT 1 FROM transactions t WHERE t.product_id=p.id AND t.status IN ('PENDING','ACCEPTED'))"];
    const args: (string | number)[] = [user.school_id];
    const category = params.get('category');
    if (category) {
      const checked = text(category, 'category', 1, 50);
      hard.category = checked;
      const spec = categorySearchSpec(checked);
      const exact = `p.category IN (${spec.exact.map(() => '?').join(',')})`;
      args.push(...spec.exact);
      if (spec.grouped) {
        const terms = spec.grouped.keywords.map(() =>
          '(instr(lower(p.title),lower(?))>0 OR instr(lower(p.description),lower(?))>0)'
        ).join(' OR ');
        where.push(`(${exact} OR (p.category=? AND (${terms})))`);
        args.push(spec.grouped.category);
        for (const term of spec.grouped.keywords) args.push(term, term);
      } else where.push(exact);
    }
    for (const [key, column, max] of [
      ['campus','campus',100], ['condition','condition',30], ['version','version',100]
    ] as const) {
      const value = params.get(key);
      if (value) {
        const checked = text(value, key, 1, max); hard[key] = checked;
        if (key === 'condition') {
          const rank = ['unknown', 'fair', 'good', 'like_new', 'new'];
          const index = rank.indexOf(checked);
          if (index < 0) throw new ApiError(400, 'BAD_REQUEST', '成色不支持');
          const allowed = rank.slice(index);
          where.push(`p.condition IN (${allowed.map(() => '?').join(',')})`); args.push(...allowed);
        } else { where.push(`p.${column}=?`); args.push(checked); }
      }
    }
    const keyword = params.get('keyword');
    if (keyword) {
      const checked = text(keyword, 'keyword', 1, 100);
      hard.keyword = checked;
      for (const aliases of keywordGroups(checked)) {
        where.push(`(${aliases.map(() =>
          '(instr(lower(p.title),lower(?))>0 OR instr(lower(p.category),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(coalesce(p.version,\'\')),lower(?))>0)'
        ).join(' OR ')})`);
        for (const alias of aliases) args.push(alias, alias, alias, alias);
      }
    }
    for (const [key, op] of [['minPriceCents','>='],['maxPriceCents','<=']] as const) {
      const value = params.get(key);
      if (value !== null) { const num = Number(value); if (!Number.isSafeInteger(num) || num < 0 || num > 10_000_000) throw new ApiError(400, 'BAD_REQUEST', `${key} 无效`);
        hard[key] = num; where.push(`p.price_cents${op}?`); args.push(num); }
    }
    const excluded = params.get('excludeKeywords');
    if (excluded !== null) {
      let values: unknown;
      try { values = JSON.parse(excluded); } catch { throw new ApiError(400, 'BAD_REQUEST', '排除关键词格式不正确'); }
      if (!Array.isArray(values) || values.length > 5 || values.some(v => typeof v !== 'string' || v.length < 1 || v.length > 40)) throw new ApiError(400, 'BAD_REQUEST', '排除关键词不支持');
      hard.excludeKeywords = values;
      for (const value of values as string[]) {
        const groups = keywordGroups(value);
        where.push(`NOT (${groups.map(aliases => `(${aliases.map(() => '(instr(lower(p.title),lower(?))>0 OR instr(lower(p.category),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(coalesce(p.version,\'\')),lower(?))>0)').join(' OR ')})`).join(' AND ')})`);
        for (const aliases of groups) for (const alias of aliases) args.push(alias, alias, alias, alias);
      }
    }
    const sort = params.get('sort');
    if (sort && !['price_asc', 'price_desc', 'published_desc'].includes(sort)) throw new ApiError(400, 'BAD_REQUEST', '排序方式不支持');
    if (sort) hard.sort = sort;
    const preferredCampus = params.get('preferredCampus');
    if (preferredCampus) soft.preferredCampus = text(preferredCampus, 'preferredCampus', 1, 100);
    const clause = where.join(' AND ');
    const total = (this.db.prepare(`SELECT count(*) AS n FROM products p WHERE ${clause}`).get(...args) as { n: number }).n;
    const offset = (page - 1) * pageSize;
    const preferredOrder = preferredCampus ? 'CASE WHEN p.campus=? THEN 0 ELSE 1 END,' : '';
    const orderArgs = preferredCampus ? [preferredCampus] : [];
    const priceOrder = sort === 'price_asc' ? 'p.price_cents ASC,' : sort === 'price_desc' ? 'p.price_cents DESC,' : '';
    const rows = this.db.prepare(`SELECT p.* FROM products p WHERE ${clause} ORDER BY ${priceOrder}${preferredOrder}p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`)
      .all(...args, ...orderArgs, pageSize, offset) as ProductRow[];
    return { listings: rows.map(row => this.listing(row)), page, pageSize, total, hasMore: offset + rows.length < total,
      appliedConditions: { hard, soft }, source: 'business_backend' };
  }

  preferences(user: UserRow): Record<string, unknown> {
    const row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(user.id) as
      { favorite_categories: string; preferred_campuses: string; price_ceiling_cents: number | null } | undefined;
    return { favoriteCategories: row ? JSON.parse(row.favorite_categories) : [],
      preferredCampuses: row ? JSON.parse(row.preferred_campuses) : [],
      ...(row?.price_ceiling_cents != null ? { priceCeilingCents: row.price_ceiling_cents } : {}), source: 'business_backend' };
  }
}
