import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './db.js';
import { ApiError } from './http.js';
import { hashPassword, validatePassword } from './password.js';

// Demo identity policy: trim and lowercase the entire address, without changing
// dots or plus tags. Email ownership remains unverified until mail is integrated.
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_EMAIL', '请输入正确的邮箱地址');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[\x21-\x7e]+$/.test(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.split('@')[0]!.length > 64) {
    throw new ApiError(400, 'INVALID_EMAIL', '请输入正确的邮箱地址');
  }
  return email;
}

/** DirectMail accepts recipient lists; registration must accept exactly one mailbox. */
export function normalizeDeliveryEmail(value: unknown): string {
  const email = normalizeEmail(value);
  const [local, domain] = email.split('@') as [string, string];
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
    throw new ApiError(400, 'INVALID_EMAIL', '请输入一个正确的邮箱地址');
  }
  return email;
}

export async function provisionAccounts(db: DatabaseSync, schoolId: string, input: unknown,
  mode: 'create' | 'reset' = 'create'): Promise<{ id: string; email: string; nickname: string }[]> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new Error('Account file must be an array containing 1–100 accounts');
  }
  const emails = new Set<string>(), ids = new Set<string>();
  const entries = input.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid account entry');
    const entry = value as Record<string, unknown>;
    const email = normalizeEmail(entry.email);
    const password = validatePassword(entry.password);
    const nickname = entry.nickname === undefined ? email.split('@')[0]!.slice(0, 24) : entry.nickname;
    if (typeof nickname !== 'string' || !nickname.trim() || nickname.trim().length > 24) throw new Error('Nickname must contain 1–24 characters');
    if (emails.has(email)) throw new Error('Duplicate email in account file');
    emails.add(email);
    const existingUserId = entry.existingUserId;
    if (existingUserId !== undefined && (typeof existingUserId !== 'string' || !/^user_[a-zA-Z0-9_-]{1,100}$/.test(existingUserId))) {
      throw new Error('Invalid existingUserId');
    }
    if (typeof existingUserId === 'string') {
      if (mode === 'reset' || ids.has(existingUserId)) throw new Error('Invalid or duplicate existingUserId');
      ids.add(existingUserId);
    }
    return { email, password, nickname: nickname.trim(), existingUserId: existingUserId as string | undefined };
  });
  const hashes: string[] = [];
  for (const entry of entries) hashes.push(await hashPassword(entry.password));
  return transaction(db, () => entries.map((entry, index) => {
    const existing = db.prepare('SELECT id,nickname FROM users WHERE email=?').get(entry.email) as { id: string; nickname: string } | undefined;
    if (mode === 'reset') {
      if (!existing) throw new Error('Cannot reset an account that does not exist');
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashes[index]!, existing.id);
      db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(Date.now(), existing.id);
      db.prepare("DELETE FROM auth_login_attempts WHERE scope='email' AND key=?").run(entry.email);
      return { ...existing, email: entry.email };
    }
    if (existing) throw new Error('Email already exists; import never overwrites accounts. Use --reset only for an intentional password reset.');
    const id = entry.existingUserId ?? `user_${randomUUID().replaceAll('-', '')}`;
    if (entry.existingUserId) {
      const old = db.prepare('SELECT email FROM users WHERE id=?').get(id);
      if (!old || old.email !== null) throw new Error('existingUserId must identify an existing account without an email');
      db.prepare('UPDATE users SET email=?,password_hash=? WHERE id=?').run(entry.email, hashes[index]!, id);
      db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(Date.now(), id);
    } else {
      db.prepare('INSERT INTO users(id,email,nickname,avatar,school_id,created_at,password_hash) VALUES(?,?,?,?,?,?,?)')
        .run(id, entry.email, entry.nickname, '', schoolId, Date.now(), hashes[index]!);
    }
    const user = db.prepare('SELECT nickname FROM users WHERE id=?').get(id)!;
    return { id, email: entry.email, nickname: String(user.nickname) };
  }));
}
