import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const at = args.indexOf('--base-url');
if (at < 0 || !args[at + 1]) throw new Error('Use --base-url https://api.example.com [--registration-test]');
const base = new URL(args[at + 1]);
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Use a plain HTTP(S) origin');
const origin = base.origin;
const call = async (path, method = 'GET', body, token) => {
  const response = await fetch(origin + path, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  let data; try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
};
try {
  const health = await call('/health/ready');
  if (health.status !== 200 || health.data?.status !== 'ok') throw new Error('API health check failed');
  if ((await call('/internal/listings/search')).status !== 404) throw new Error('Public internal route is not blocked; check the reverse proxy');
  // Empty JSON proves this is an anonymous registration route without creating an account.
  const registration = await call('/api/v1/auth/registrations', 'POST', {});
  if (registration.status === 429) throw new Error('Registration probe is rate-limited; wait for the current limit window before retrying');
  if (registration.status !== 400 || registration.data?.code !== 'INVALID_EMAIL') throw new Error(`Anonymous registration route unavailable (HTTP ${registration.status}); deploy the matching API`);
  console.log('PASS: API ready, internal routes blocked, anonymous registration available.');
  if (args.includes('--registration-test')) {
    if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Real registration smoke test requires HTTPS or localhost');
    const suffix = randomBytes(8).toString('hex'), email = `migration-${suffix}@example.invalid`, password = randomBytes(24).toString('base64url');
    const rejected = await call('/api/v1/auth/registrations', 'POST', { email, password,
      agreementVersion: '2026-10-23-draft-4', privacyVersion: '2026-10-23-draft-4' });
    if (rejected.status !== 400 || rejected.data?.code !== 'EMAIL_VERIFICATION_REQUIRED') {
      throw new Error('Registration must require an email verification challenge and code');
    }
    console.log('PASS: unverified registration rejected; no account created or verification email sent. Complete real email acceptance using docs/aliyun-email-handoff.md.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
