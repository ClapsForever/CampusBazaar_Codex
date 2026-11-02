import { lstatSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.js';
import { transaction } from './db.js';
import { pruneManagedBackups } from './retention-backups.js';

export const DATA_RETENTION_MS = 365 * 24 * 60 * 60_000;
export const RETENTION_INTERVAL_MS = 60 * 60_000;
const imageName = /^img_[a-f0-9]{32}\.(jpg|png|webp)$/;

export interface RetentionReport {
  cutoff: number;
  dryRun: boolean;
  removed: Record<string, number>;
  redacted: Record<string, number>;
  filesDeleted: number;
  fileFailures: number;
  backupsDeleted: number;
  backupFailures: number;
}

/** Every row keeps its own original timestamp. Never cascade-delete newer children. */
export function cleanupExpiredData(db: DatabaseSync, config: Pick<Config, 'uploadDir' | 'databasePath' | 'retentionBackupDir'>,
  now = Date.now(), dryRun = false): RetentionReport {
  if (!Number.isSafeInteger(now) || now < DATA_RETENTION_MS) throw new Error('Invalid retention clock');
  const cutoff = now - DATA_RETENTION_MS;
  const report: RetentionReport = { cutoff, dryRun, removed: {}, redacted: {},
    filesDeleted: 0, fileFailures: 0, backupsDeleted: 0, backupFailures: 0 };
  const previewRollback = new Error('retention-preview-rollback');
  const remove = (name: string, sql: string, ...args: (string | number)[]) => {
    report.removed[name] = (report.removed[name] ?? 0) + Number(db.prepare(sql).run(...args).changes);
  };
  const redact = (name: string, sql: string, ...args: (string | number)[]) => {
    report.redacted[name] = Number(db.prepare(sql).run(...args).changes);
  };
  try {
    transaction(db, () => {
      // Short security lifetimes are not extended to one year.
      for (const [table, column] of [['auth_captchas', 'expires_at'], ['auth_login_attempts', 'until_at'],
        ['auth_registration_limits', 'until_at'], ['email_verification_limits', 'until_at']] as const) {
        remove(table, `DELETE FROM ${table} WHERE ${column}<=?`, now);
      }
      remove('email_verifications', 'DELETE FROM email_verifications WHERE expires_at<=? OR created_at<=?', now, cutoff);
      remove('auth_login_attempts', `DELETE FROM auth_login_attempts WHERE scope='email'
        AND key IN (SELECT email FROM users WHERE created_at<=?)`, cutoff);
      remove('auth_sessions', `DELETE FROM auth_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL
        OR user_id IN (SELECT id FROM users WHERE created_at<=?)`, now, cutoff);
      remove('registration_consents', 'DELETE FROM registration_consents WHERE accepted_at<=?', cutoff);
      remove('idempotency_records', 'DELETE FROM idempotency_records WHERE created_at<=?', cutoff);
      // Preferences have no write endpoint/timestamp; imported preferences belong to the account's original record.
      remove('user_preferences', 'DELETE FROM user_preferences WHERE user_id IN (SELECT id FROM users WHERE created_at<=?)', cutoff);
      remove('messages', 'DELETE FROM messages WHERE send_time<=?', cutoff);
      remove('agent_turns', 'DELETE FROM agent_turns WHERE created_at<=?', cutoff);
      remove('agent_sessions', `DELETE FROM agent_sessions WHERE created_at<=?
        AND NOT EXISTS (SELECT 1 FROM agent_turns t WHERE t.session_id=agent_sessions.session_id)`, cutoff);

      // Persist the file work in the SAME transaction as deleting its metadata.
      // A filesystem failure or process crash can then be retried after restart.
      const expiredImages = db.prepare('SELECT id,extension FROM product_images WHERE created_at<=?').all(cutoff);
      for (const image of expiredImages) {
        const name = `${image.id}.${image.extension}`;
        if (!imageName.test(name)) throw new Error('Invalid expired image filename');
        db.prepare('INSERT OR IGNORE INTO retention_file_deletions(filename,queued_at) VALUES(?,?)').run(name, now);
      }
      db.prepare(`UPDATE users SET avatar='' WHERE avatar IN (SELECT id FROM product_images WHERE created_at<=?)`).run(cutoff);
      remove('product_images', 'DELETE FROM product_images WHERE created_at<=?', cutoff);

      // Erase expired content even if a newer child still requires the parent's ID.
      redact('transactions', `UPDATE transactions SET title_snapshot='',price_cents=0,status='CANCELLED'
        WHERE create_time<=? AND (title_snapshot<>'' OR price_cents<>0 OR status<>'CANCELLED')`, cutoff);
      remove('transactions', `DELETE FROM transactions WHERE create_time<=?
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.transaction_id=transactions.id)`, cutoff);
      redact('products', `UPDATE products SET title='已过期商品',description='',price_cents=1,
        category='其他',condition='unknown',campus='',version=NULL,status='DELISTED'
        WHERE published_at<=? AND (title<>'已过期商品' OR description<>'' OR price_cents<>1
          OR category<>'其他' OR condition<>'unknown' OR campus<>'' OR version IS NOT NULL OR status<>'DELISTED')`, cutoff);
      remove('products', `DELETE FROM products WHERE published_at<=?
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.product_id=products.id)
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=products.id)`, cutoff);
      redact('users', `UPDATE users SET email=NULL,phone=NULL,password_hash=NULL,email_verified_at=NULL,
        nickname='已过期用户',avatar='',enabled=0 WHERE created_at<=?
        AND (email IS NOT NULL OR phone IS NOT NULL OR password_hash IS NOT NULL OR email_verified_at IS NOT NULL
          OR nickname<>'已过期用户' OR avatar<>'' OR enabled<>0)`, cutoff);
      // Expired accounts cannot accept new trades, but recent records remain readable to other participants.
      db.prepare(`UPDATE products SET status='DELISTED' WHERE status='ACTIVE'
        AND seller_id IN (SELECT id FROM users WHERE created_at<=?)`).run(cutoff);
      db.prepare(`UPDATE transactions SET status='CANCELLED' WHERE status IN ('PENDING','ACCEPTED') AND
        (buyer_id IN (SELECT id FROM users WHERE created_at<=?) OR seller_id IN (SELECT id FROM users WHERE created_at<=?))`)
        .run(cutoff, cutoff);
      remove('users', `DELETE FROM users WHERE created_at<=?
        AND NOT EXISTS (SELECT 1 FROM products p WHERE p.seller_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.owner_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.buyer_id=users.id OR t.seller_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.sender_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM agent_sessions s WHERE s.user_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM registration_consents c WHERE c.user_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM idempotency_records r WHERE r.user_id=users.id)`, cutoff);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Retention foreign key check failed');
      if (dryRun) throw previewRollback;
    });
  } catch (error) {
    if (error !== previewRollback) throw error;
  }
  if (dryRun) return report;

  const root = realpathSync(config.uploadDir);
  // Failed uploads can leave unreferenced files. Only consider our own flat UUID filenames.
  for (const name of readdirSync(root)) {
    if (!imageName.test(name)) continue;
    const info = lstatSync(join(root, name));
    if (!info.isFile() || info.isSymbolicLink() || info.mtimeMs > cutoff) continue;
    const id = name.slice(0, name.lastIndexOf('.'));
    if (!db.prepare('SELECT 1 FROM product_images WHERE id=?').get(id)) {
      db.prepare('INSERT OR IGNORE INTO retention_file_deletions(filename,queued_at) VALUES(?,?)').run(name, now);
    }
  }
  for (const item of db.prepare('SELECT filename FROM retention_file_deletions').all()) {
    const name = String(item.filename), target = resolve(root, name), distance = relative(root, target);
    try {
      if (!imageName.test(name) || isAbsolute(distance) || distance.startsWith(`..${sep}`) || distance === '..' ||
          realpathSync(config.uploadDir) !== root) throw new Error('Unsafe image deletion path');
      if (db.prepare('SELECT 1 FROM product_images WHERE id=?').get(name.slice(0, name.lastIndexOf('.')))) {
        db.prepare('DELETE FROM retention_file_deletions WHERE filename=?').run(name);
        continue;
      }
      try {
        const info = lstatSync(target);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Image is not a regular file');
        unlinkSync(target);
        report.filesDeleted++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      db.prepare('DELETE FROM retention_file_deletions WHERE filename=?').run(name);
    } catch { report.fileFailures++; }
  }
  if (config.retentionBackupDir) {
    try {
      const backups = pruneManagedBackups(config.retentionBackupDir, config, now);
      report.backupsDeleted = backups.deleted;
      report.backupFailures = backups.failures;
    } catch { report.backupFailures++; }
  }
  // secure_delete scrubs freed pages; checkpoint also retires old WAL pages when readers permit it.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return report;
}
