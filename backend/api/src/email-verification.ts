import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { normalizeDeliveryEmail } from './accounts.js';
import type { Config } from './config.js';
import { transaction } from './db.js';
import { ApiError } from './http.js';
import { mailUnavailable, type VerificationEmailSender } from './mailer.js';

const lifetimeMs = 5 * 60_000;
const resendMs = 60_000;
const maximumRows = 10_000;
const maximumAttempts = 5;
const idPattern = /^emailv_[a-f0-9]{32}$/;

type VerificationRow = { id: string; email: string; purpose: string; state: string;
  code_hash: string; attempts: number; expires_at: number };

function invalidCode(): ApiError {
  return new ApiError(400, 'EMAIL_CODE_INVALID', '邮箱验证码错误、已过期或已失效，请检查或重新获取');
}

export class EmailVerificationService {
  constructor(private db: DatabaseSync, private config: Config, private sender?: VerificationEmailSender) {}

  private digest(value: string): string {
    return createHmac('sha256', this.config.sessionSecret).update(`email-verification:${value}`).digest('hex');
  }

  cleanup(now = Date.now()): void {
    this.db.prepare('DELETE FROM email_verifications WHERE expires_at<=?').run(now);
    this.db.prepare('DELETE FROM email_verification_limits WHERE until_at<=?').run(now);
  }

  async issue(body: Record<string, unknown>, clientIp: string) {
    const email = normalizeDeliveryEmail(body.email);
    if (body.purpose !== undefined && body.purpose !== 'register') throw new ApiError(400, 'BAD_REQUEST', '当前仅支持注册邮箱验证');
    if (!this.sender) throw mailUnavailable();
    const now = Date.now(), id = `emailv_${randomUUID().replaceAll('-', '')}`;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    transaction(this.db, () => {
      this.cleanup(now);
      // Persist limits before the network call: concurrent requests, failures
      // and process restarts must not bypass the sending budget.
      const emailKey = this.digest(`email:${email}`), ipKey = this.digest(`ip:${clientIp}`);
      const limits = [
        ['email_cooldown', emailKey, 1, resendMs],
        ['email_hour', emailKey, 5, 60 * 60_000],
        ['email_day', emailKey, 10, 24 * 60 * 60_000],
        ['ip', ipKey, 20, 15 * 60_000],
        ['global_minute', '*', 30, 60_000],
        ['global_day', '*', this.config.emailSendDailyLimit ?? 200, 24 * 60 * 60_000]
      ] as const;
      let newRows = 0;
      for (const [scope, key, maximum] of limits) {
        const row = this.db.prepare('SELECT count,until_at FROM email_verification_limits WHERE scope=? AND key=?').get(scope, key);
        if (row && Number(row.count) >= maximum) throw new ApiError(429, 'EMAIL_SEND_RATE_LIMITED',
          '验证码发送过于频繁，请稍后重试', true, Math.max(1, Math.ceil((Number(row.until_at) - now) / 1000)));
        if (!row) newRows++;
      }
      if (Number(this.db.prepare('SELECT COUNT(*) AS n FROM email_verification_limits').get()!.n) + newRows > maximumRows ||
        Number(this.db.prepare('SELECT COUNT(*) AS n FROM email_verifications').get()!.n) >= maximumRows) {
        throw new ApiError(429, 'EMAIL_SEND_RATE_LIMITED', '验证请求过多，请稍后重试', true, 60);
      }
      for (const [scope, key, , window] of limits) this.db.prepare(`
        INSERT INTO email_verification_limits(scope,key,count,until_at) VALUES(?,?,1,?)
        ON CONFLICT(scope,key) DO UPDATE SET count=count+1`).run(scope, key, now + window);
      if (this.db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) {
        // Commit the attempt budget even for an occupied address.
        return;
      }
      this.db.prepare(`INSERT INTO email_verifications(id,email,purpose,code_hash,state,attempts,created_at,expires_at)
        VALUES(?,?,'register',?,'sending',0,?,?) ON CONFLICT(email,purpose) DO UPDATE SET
        id=excluded.id,code_hash=excluded.code_hash,state='sending',attempts=0,created_at=excluded.created_at,expires_at=excluded.expires_at`)
        .run(id, email, this.digest(`${id}:register:${email}:${code}`), now, now + lifetimeMs);
    });
    // Keep response shape and status the same for occupied addresses, without
    // sending sign-up messages to them or exposing existing account identifiers.
    const response = { verificationId: id, expiresAt: now + lifetimeMs, expiresIn: 300, resendAfter: 60 };
    if (!this.db.prepare("SELECT 1 FROM email_verifications WHERE id=? AND state='sending'").get(id)) return response;
    try {
      await this.sender.sendVerification({ email, code });
      const update = this.db.prepare("UPDATE email_verifications SET state='sent' WHERE id=? AND state='sending' AND expires_at>?")
        .run(id, Date.now());
      if (update.changes !== 1) throw mailUnavailable();
    } catch {
      // The id condition prevents a late failure from destroying a newer code.
      this.db.prepare("UPDATE email_verifications SET state='failed',code_hash='' WHERE id=? AND state='sending'").run(id);
      throw mailUnavailable();
    }
    return response;
  }

  requireInput(body: Record<string, unknown>): { id: string; code: string } {
    if (body.emailVerificationId === undefined || body.emailCode === undefined) {
      throw new ApiError(400, 'EMAIL_VERIFICATION_REQUIRED', '请先获取并填写邮箱验证码');
    }
    if (typeof body.emailVerificationId !== 'string' || !idPattern.test(body.emailVerificationId) ||
      typeof body.emailCode !== 'string') throw invalidCode();
    return { id: body.emailVerificationId, code: body.emailCode.trim() };
  }

  /** Called inside the account-creation transaction. Return errors so failed
   * attempt increments commit; throwing inside that transaction would undo them. */
  consume(email: string, id: string, code: string, now: number): ApiError | undefined {
    const row = this.db.prepare("SELECT * FROM email_verifications WHERE id=? AND email=? AND purpose='register'")
      .get(id, email) as VerificationRow | undefined;
    if (!row || row.state !== 'sent' || row.expires_at <= now || row.attempts >= maximumAttempts) return invalidCode();
    const actual = Buffer.from(this.digest(`${id}:register:${email}:${code}`), 'hex');
    const expected = Buffer.from(row.code_hash, 'hex');
    if (!/^\d{6}$/.test(code) || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      this.db.prepare('UPDATE email_verifications SET attempts=attempts+1 WHERE id=?').run(id);
      return invalidCode();
    }
    this.db.prepare("UPDATE email_verifications SET state='consumed',code_hash='' WHERE id=? AND state='sent'").run(id);
  }
}
