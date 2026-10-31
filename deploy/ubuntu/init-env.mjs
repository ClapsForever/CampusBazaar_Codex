import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// An optional destination allows checking templates without touching /etc.
const directory = resolve(process.argv[2] ?? '/etc/campusbazaar');
const apiPath = join(directory, 'api.env');
const agentPath = join(directory, 'agent.env');
if (existsSync(apiPath) || existsSync(agentPath)) {
  throw new Error('Configuration already exists. Edit existing files; do not rotate secrets during a code update.');
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
const secret = () => randomBytes(32).toString('hex');
const sessionSecret = secret();
const tokenA = secret();
const tokenB = secret();
const api = `APP_MODE=local
HOST=127.0.0.1
PORT=8080
DATABASE_PATH=/var/lib/campusbazaar/campusbazaar.sqlite
UPLOAD_DIR=/var/lib/campusbazaar/uploads
PUBLIC_BASE_URL=http://YOUR_PUBLIC_IPV4
SESSION_SECRET=${sessionSecret}
AGENT_BASE_URL=http://127.0.0.1:3000
AGENT_SERVICE_TOKEN=${tokenA}
INTERNAL_AGENT_TOKEN=${tokenB}
AGENT_SCHOOL_ID=school_demo
EMAIL_PROVIDER=disabled
EMAIL_SEND_DAILY_LIMIT=200
ALIYUN_DM_REGION_ID=cn-hangzhou
ALIYUN_DM_SENDER=noreply@notify.example.com
ALIYUN_DM_SENDER_NAME=同窗集
ALIYUN_DM_CREDENTIAL_TYPE=ecs_ram_role
ALIYUN_DM_ROLE_NAME=
`;
const agent = `NODE_ENV=production
PORT=3000
LOG_LEVEL=info
SERVICE_AUTH_TOKEN=${tokenA}
MOCK_BACKEND=false
MODEL_MODE=real
MODEL_PROVIDER=deepseek
MODEL_NAME=deepseek-chat
MODEL_BASE_URL=https://api.deepseek.com
MODEL_API_KEY=
BUSINESS_BACKEND_URL=http://127.0.0.1:8080
BUSINESS_BACKEND_TOKEN=${tokenB}
BUSINESS_SEARCH_PATH=/internal/listings/search
BUSINESS_DETAIL_PATH=/internal/listings/{listingId}
BUSINESS_PREFERENCES_PATH=/internal/users/preferences
MAX_MESSAGE_CHARS=2000
MAX_RESULTS=10
MAX_TOOL_CALLS=6
TOOL_TIMEOUT_MS=10000
TURN_TIMEOUT_MS=60000
SESSION_TTL_MS=86400000
`;
writeFileSync(apiPath, api, { mode: 0o600, flag: 'wx' });
writeFileSync(agentPath, agent, { mode: 0o600, flag: 'wx' });
console.log(`Created ${apiPath} and ${agentPath}. Set PUBLIC_BASE_URL and MODEL_API_KEY before starting services.`);
