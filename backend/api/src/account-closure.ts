import type { DatabaseSync } from 'node:sqlite';
import { normalizeEmail } from './accounts.js';
import { transaction } from './db.js';

export function closeAccount(db: DatabaseSync, emailInput: unknown, confirmedId?: string) {
  const email = normalizeEmail(emailInput);
  const preview = new Error('account-closure-preview');
  const report = { userId: '', dryRun: confirmedId === undefined, changes: {} as Record<string, number> };
  const change = (name: string, sql: string, ...params: (string | number)[]) => {
    report.changes[name] = Number(db.prepare(sql).run(...params).changes);
  };

  try {
    transaction(db, () => {
      const account = db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if (typeof account?.id !== 'string') throw new Error('No account with that email address');
      const id = account.id;
      if (confirmedId !== undefined && confirmedId !== id) throw new Error('Account ID changed or does not match the preview');
      report.userId = id;

      for (const table of ['auth_sessions', 'registration_consents', 'user_preferences', 'idempotency_records']) {
        change(table, `DELETE FROM ${table} WHERE user_id=?`, id);
      }
      change('email_verifications', 'DELETE FROM email_verifications WHERE email=?', email);
      change('auth_login_attempts', "DELETE FROM auth_login_attempts WHERE scope='email' AND key=?", email);
      change('agent_turns', 'DELETE FROM agent_turns WHERE session_id IN (SELECT session_id FROM agent_sessions WHERE user_id=?)', id);
      change('agent_sessions', 'DELETE FROM agent_sessions WHERE user_id=?', id);
      change('messages', 'DELETE FROM messages WHERE sender_id=?', id);

      change('imagesQueued', `INSERT OR IGNORE INTO retention_file_deletions(filename,queued_at)
        SELECT id || '.' || extension, ? FROM product_images WHERE owner_id=?`, Date.now(), id);
      change('images', 'DELETE FROM product_images WHERE owner_id=?', id);

      change('transactionsCancelled', `UPDATE transactions SET status='CANCELLED'
        WHERE status IN ('PENDING','ACCEPTED') AND (buyer_id=? OR seller_id=?)`, id, id);
      change('productsRemoved', `DELETE FROM products WHERE seller_id=?
        AND NOT EXISTS (SELECT 1 FROM transactions WHERE product_id=products.id)
        AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=products.id)`, id);
      change('productsRedacted', `UPDATE products SET title='已注销商品',description='',price_cents=1,
        category='其他',condition='unknown',campus='',version=NULL,status='DELISTED' WHERE seller_id=?`, id);
      change('userRemoved', `DELETE FROM users WHERE id=?
        AND NOT EXISTS (SELECT 1 FROM products WHERE seller_id=users.id)
        AND NOT EXISTS (SELECT 1 FROM transactions WHERE buyer_id=users.id OR seller_id=users.id)`, id);
      // Keep a de-identified row when a counterparty's transaction still references it.
      change('userRedacted', `UPDATE users SET email=NULL,phone=NULL,password_hash=NULL,email_verified_at=NULL,
        nickname='已注销用户',avatar='',enabled=0 WHERE id=?`, id);
      if (report.dryRun) throw preview;
    });
  } catch (error) {
    if (error !== preview) throw error;
  }
  return report;
}
