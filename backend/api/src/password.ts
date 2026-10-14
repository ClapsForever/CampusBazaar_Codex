import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './http.js';

const deriveKey = promisify(scrypt);

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6 || value.length > 64 || !value.trim()) {
    throw new ApiError(400, 'INVALID_PASSWORD', '演示账号密码须为 6–64 位，不能全部为空白');
  }
  return value;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(value: unknown, stored: string | null): Promise<boolean> {
  if (typeof value !== 'string' || value.length > 64 || !stored) return false;
  const [algorithm, salt, hex] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false;
  const key = await deriveKey(value, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
