import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from './config.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable = false) {
    super(message);
  }
}

export function send(res: ServerResponse, status: number, body: unknown, requestId: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId
  });
  res.end(JSON.stringify(body));
}

export function fail(res: ServerResponse, error: unknown, requestId: string): void {
  const known = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', '服务器内部错误', true);
  if (!(error instanceof ApiError)) console.error(JSON.stringify({ requestId, code: known.code, error: String(error) }));
  send(res, known.status, { requestId, code: known.code, message: known.message, retryable: known.retryable }, requestId);
}

export function requestId(req: IncomingMessage): string {
  const candidate = req.headers['x-request-id'];
  return typeof candidate === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(candidate) ? candidate : `req_${randomUUID()}`;
}

export async function readBytes(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] || '').toString().toLowerCase().startsWith('application/json')) {
    throw new ApiError(400, 'BAD_REQUEST', '需要 application/json 请求体');
  }
  const bytes = await readBytes(req, 1_000_000);
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'JSON 格式不正确');
  }
}

export function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new ApiError(400, 'BAD_REQUEST', `${name} 格式不正确`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new ApiError(400, 'BAD_REQUEST', `${name} 长度应为 ${min}–${max}`);
  return result;
}

export function optionalText(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, name, 1, max);
}

export function positiveInt(value: unknown, name: string, max: number): number {
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 1 || num > max) throw new ApiError(400, 'BAD_REQUEST', `${name} 格式不正确`);
  return num;
}

export function moneyToCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100000 ||
    Math.abs(Math.round(value * 100) - value * 100) > 1e-7) {
    throw new ApiError(400, 'BAD_REQUEST', '价格必须为大于 0 且最多两位小数的数字');
  }
  return Math.round(value * 100);
}

export function equalToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer (\S+)$/i.exec(header) : null;
  if (!match?.[1]) throw new ApiError(401, 'UNAUTHORIZED', '需要有效的 Bearer 令牌');
  return match[1];
}

export function tokenHash(token: string, config: Config): string {
  return createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

export function bodyHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function cursorEncode(time: number, id: string): string {
  return Buffer.from(JSON.stringify([time, id])).toString('base64url');
}

export function cursorDecode(value: string | null): [number, string] | null {
  if (!value) return null;
  if (value.length > 200) throw new ApiError(400, 'BAD_CURSOR', '游标无效');
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (Array.isArray(parsed) && parsed.length === 2 && Number.isSafeInteger(parsed[0]) && typeof parsed[1] === 'string' && parsed[1].length < 100) {
      return parsed as [number, string];
    }
  } catch { /* invalid cursor */ }
  throw new ApiError(400, 'BAD_CURSOR', '游标无效');
}
