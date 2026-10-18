import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import type { Config } from './config.js';
import { transaction } from './db.js';
import { ApiError } from './http.js';

export const AGREEMENT_VERSION = '2026-10-18-draft-3';
export const PRIVACY_VERSION = '2026-10-18-draft-3';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const challengeLifetime = 5 * 60_000;
const maximumStoredRows = 10_000;
const idPattern = /^captcha_[a-f0-9]{32}$/;

// A small bitmap font keeps challenge text out of responses and PNG metadata.
const glyphs: Record<string, string[]> = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','11001','10101','10011','10011','10001'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110']
};

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, bytes: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from(type, 'ascii'), bytes]);
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([size, payload, checksum]);
}

function captchaPng(code: string): Buffer {
  const width = 160, height = 56, pixels = Buffer.alloc(width * height * 3, 247);
  const paint = (x: number, y: number, color: number[]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = color[c]!;
  };
  for (let n = 0; n < 300; n++) paint(randomInt(width), randomInt(height), [190, 205, 218]);
  for (let n = 0; n < 5; n++) {
    const startY = randomInt(height), endY = randomInt(height);
    for (let x = 0; x < width; x++) paint(x, Math.round(startY + (endY - startY) * x / width), [175, 192, 210]);
  }
  [...code].forEach((character, index) => {
    const left = 14 + index * 34 + randomInt(-2, 3), top = 11 + randomInt(-3, 4);
    const slope = randomInt(-2, 3) / 10;
    const color = [randomInt(30, 85), randomInt(45, 105), randomInt(65, 120)];
    glyphs[character]!.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel !== '1') return;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const dy = y * 4 + sy;
        paint(left + x * 4 + sx + Math.round((dy - 14) * slope), top + dy, color);
      }
    }));
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

export class RegistrationProtection {
  constructor(private db: DatabaseSync, private config: Pick<Config, 'sessionSecret'>) {}

  private reserve(kind: 'captcha' | 'registration', clientIp: string): void {
    const now = Date.now(), window = kind === 'captcha' ? challengeLifetime : 15 * 60_000;
    const limits = kind === 'captcha' ? [30, 1000] : [20, 500];
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM auth_captchas WHERE expires_at<=?').run(now);
      this.db.prepare('DELETE FROM auth_registration_limits WHERE until_at<=?').run(now);
      const entries = [[`${kind}_ip`, clientIp, limits[0]!], [`${kind}_global`, '*', limits[1]!]] as const;
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

  issueCaptcha(body: Record<string, unknown>, clientIp: string): { id: string; imageBase64: string; expiresAt: number } {
    if (body.previousId !== undefined && body.previousId !== '' && (typeof body.previousId !== 'string' || !idPattern.test(body.previousId))) {
      throw new ApiError(400, 'BAD_REQUEST', '验证码标识不正确');
    }
    this.reserve('captcha', clientIp);
    const id = `captcha_${randomUUID().replaceAll('-', '')}`;
    const code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]!).join('');
    const expiresAt = Date.now() + challengeLifetime;
    const imageBase64 = `data:image/png;base64,${captchaPng(code).toString('base64')}`;
    transaction(this.db, () => {
      if (body.previousId) this.db.prepare('DELETE FROM auth_captchas WHERE id=? AND client_ip=?').run(String(body.previousId), clientIp);
      if (Number(this.db.prepare('SELECT COUNT(*) AS n FROM auth_captchas').get()!.n) >= maximumStoredRows) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '请求过于频繁，请稍后重试');
      }
      const hash = createHmac('sha256', this.config.sessionSecret).update(`${id}:${code}`).digest('hex');
      this.db.prepare('INSERT INTO auth_captchas(id,client_ip,code_hash,expires_at) VALUES(?,?,?,?)')
        .run(id, clientIp, hash, expiresAt);
    });
    return { id, imageBase64, expiresAt };
  }

  reserveRegistration(clientIp: string): void { this.reserve('registration', clientIp); }

  consumeCaptcha(id: unknown, code: unknown, clientIp: string): void {
    const valid = transaction(this.db, () => {
      if (typeof id !== 'string' || !idPattern.test(id)) return false;
      const row = this.db.prepare('SELECT client_ip,code_hash,expires_at FROM auth_captchas WHERE id=?').get(id);
      if (!row || row.client_ip !== clientIp) return false;
      // Any attempt by the issuing client consumes the challenge, including bad input.
      this.db.prepare('DELETE FROM auth_captchas WHERE id=?').run(id);
      if (Number(row.expires_at) <= Date.now() || typeof code !== 'string' || !/^[a-zA-Z0-9]{4}$/.test(code.trim())) return false;
      const hash = createHmac('sha256', this.config.sessionSecret).update(`${id}:${code.trim().toUpperCase()}`).digest();
      const expected = Buffer.from(String(row.code_hash), 'hex');
      return expected.length === hash.length && timingSafeEqual(hash, expected);
    });
    if (!valid) throw new ApiError(400, 'CAPTCHA_INVALID', '验证码错误或已失效，请刷新后重试');
  }
}
