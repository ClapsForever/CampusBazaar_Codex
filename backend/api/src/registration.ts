import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './db.js';
import { ApiError } from './http.js';

export const AGREEMENT_VERSION = '2026-11-06';
export const PRIVACY_VERSION = '2026-11-06';
const maximumStoredRows = 10_000;

export function requireLegalVersions(body: Record<string, unknown>): void {
  if (body.agreementVersion !== AGREEMENT_VERSION || body.privacyVersion !== PRIVACY_VERSION) {
    throw new ApiError(400, 'AGREEMENT_REQUIRED', '请阅读并同意当前版本的用户协议与隐私政策');
  }
}

export class RegistrationProtection {
  constructor(private db: DatabaseSync) {}

  reserveRegistration(clientIp: string): void {
    const now = Date.now();
    const window = 15 * 60_000;
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM auth_captchas WHERE expires_at<=?').run(now);
      this.db.prepare('DELETE FROM auth_registration_limits WHERE until_at<=?').run(now);
      const entries = [['registration_ip', clientIp, 20], ['registration_global', '*', 500]] as const;
      let addedRows = 0;
      for (const [scope, key, limit] of entries) {
        const existing = this.db.prepare('SELECT count FROM auth_registration_limits WHERE scope=? AND key=?').get(scope, key);
        if (existing && Number(existing.count) >= limit) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '请求过于频繁，请稍后重试');
        if (!existing) addedRows++;
      }
      if (Number(this.db.prepare('SELECT COUNT(*) AS n FROM auth_registration_limits').get()!.n) + addedRows > maximumStoredRows) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '请求过于频繁，请稍后重试');
      }
      for (const [scope, key] of entries) this.db.prepare(`
        INSERT INTO auth_registration_limits(scope,key,count,until_at) VALUES(?,?,1,?)
        ON CONFLICT(scope,key) DO UPDATE SET count=count+1`).run(scope, key, now + window);
    });
  }
}
