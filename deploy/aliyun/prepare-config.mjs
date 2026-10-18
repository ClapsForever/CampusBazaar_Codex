import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');

function validUrl(value, allowHttp) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    (!allowHttp && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Use an HTTPS origin without credentials, query or path; HTTP needs --allow-http-test');
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(url.hostname)) throw new Error('Use an IPv4 address or DNS hostname');
  return url;
}

function putEnv(source, updates) {
  let text = source;
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== 'string' || /[\r\n\x00]/.test(value)) throw new Error('Configuration values must be single-line strings');
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${JSON.stringify(value)}`);
  }
  return text;
}

/** Prepare files only; never connect, install services, rotate the source env or modify the App. */
export function prepareConfig({ output, publicBaseUrl, previousApiEnv, previousAgentEnv, allowHttpTest = false }) {
  const url = validUrl(publicBaseUrl, allowHttpTest);
  const origin = url.origin, hostname = url.hostname;
  if (url.port) throw new Error('Templates use standard HTTP/HTTPS ports; omit a custom port');
  const oldApi = previousApiEnv ? parseEnv(readFileSync(previousApiEnv, 'utf8')) : {};
  const oldAgent = previousAgentEnv ? parseEnv(readFileSync(previousAgentEnv, 'utf8')) : {};
  if (previousApiEnv && (!oldApi.SESSION_SECRET || oldApi.SESSION_SECRET.length < 32 || oldApi.SESSION_SECRET.startsWith('replace-'))) {
    throw new Error('Source API env has no usable SESSION_SECRET');
  }
  const apiUpdates = { PUBLIC_BASE_URL: origin };
  if (previousApiEnv) {
    apiUpdates.SESSION_SECRET = oldApi.SESSION_SECRET;
    if (oldApi.AGENT_SCHOOL_ID) apiUpdates.AGENT_SCHOOL_ID = oldApi.AGENT_SCHOOL_ID;
  }
  const agentUpdates = {};
  for (const key of ['MODEL_API_KEY', 'MODEL_PROVIDER', 'MODEL_NAME', 'MODEL_BASE_URL', 'SESSION_TTL_MS']) {
    if (oldAgent[key]) agentUpdates[key] = oldAgent[key];
  }
  // Validate inherited text before creating any destination files. Never print values.
  putEnv('', apiUpdates); putEnv('', agentUpdates);
  const directory = resolve(output);
  if (existsSync(directory)) throw new Error('Destination already exists; configuration will not be overwritten');
  if (!existsSync(dirname(directory))) throw new Error('Output parent must already exist');
  mkdirSync(directory, { mode: 0o700 });
  const envDirectory = join(directory, 'env');
  const generated = spawnSync(process.execPath, [join(repo, 'deploy/ubuntu/init-env.mjs'), envDirectory], { encoding: 'utf8' });
  if (generated.status !== 0) throw new Error('Base configuration generation failed; inspect destination without sharing secrets');
  const apiPath = join(envDirectory, 'api.env'), agentPath = join(envDirectory, 'agent.env');
  writeFileSync(apiPath, putEnv(readFileSync(apiPath, 'utf8'), apiUpdates), { mode: 0o600 });
  writeFileSync(agentPath, putEnv(readFileSync(agentPath, 'utf8'), agentUpdates), { mode: 0o600 });
  let proxy = readFileSync(join(repo, 'deploy/ubuntu/campusbazaar.nginx.conf'), 'utf8')
    .replaceAll('cb_', 'cb_aliyun_').replaceAll('YOUR_PUBLIC_IPV4', hostname)
    .replace('    location = /api/v1/auth/password/sessions {', `    location = /api/v1/auth/registrations {\n        limit_req zone=cb_aliyun_login_rate burst=10 nodelay;\n        proxy_pass http://127.0.0.1:8080;\n    }\n\n    location = /api/v1/auth/password/sessions {`);
  if (url.protocol === 'https:') {
    proxy = proxy.replace('    listen 80;', `    listen 443 ssl;\n    ssl_certificate /etc/letsencrypt/live/${hostname}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/${hostname}/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;`);
    proxy = `server {\n    listen 80;\n    server_name ${hostname};\n    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }\n    location / { return 301 https://$host$request_uri; }\n}\n\n${proxy}`;
  }
  const bootstrap = `# Temporary ACME-only server; no application API is exposed.\nserver {\n    listen 80;\n    server_name ${hostname};\n    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }\n    location / { return 503; }\n}\n`;
  writeFileSync(join(directory, 'nginx.conf'), proxy, { mode: 0o600, flag: 'wx' });
  writeFileSync(join(directory, 'nginx-bootstrap.conf'), bootstrap, { mode: 0o600, flag: 'wx' });
  writeFileSync(join(directory, 'deployment.json'), JSON.stringify({ publicBaseUrl: origin, nodeMinimum: '24.21.0',
    apiPort: 8080, agentPort: 3000, sessionSecretPreserved: !!previousApiEnv,
    schoolId: previousApiEnv && oldApi.AGENT_SCHOOL_ID ? oldApi.AGENT_SCHOOL_ID : 'school_demo',
    modelKeyProvided: !!oldAgent.MODEL_API_KEY, target: 'Ubuntu 24.04 ECS, single API and Agent' }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { directory, publicBaseUrl: origin, sessionSecretPreserved: !!previousApiEnv,
    modelKeyProvided: !!oldAgent.MODEL_API_KEY, requiresCertificate: url.protocol === 'https:' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    const keys = { '--output': 'output', '--public-base-url': 'publicBaseUrl', '--previous-api-env': 'previousApiEnv', '--previous-agent-env': 'previousAgentEnv' };
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--allow-http-test') options.allowHttpTest = true;
      else if (keys[args[index]] && args[index + 1]) {
        const key = keys[args[index]]; options[key] = args[++index];
      }
      else throw new Error('Unknown or incomplete argument');
    }
    if (!options.output || !options.publicBaseUrl) throw new Error('Use --output NEW_DIR --public-base-url https://api.example.com, optionally --previous-api-env FILE --previous-agent-env FILE');
    console.log(JSON.stringify(prepareConfig(options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
