import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './http.js';

const deriveKey = promisify(scrypt);

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 64 ||
    !/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new ApiError(400, 'INVALID_PASSWORD', '密码须为 8–64 位，包含字母和数字');
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
