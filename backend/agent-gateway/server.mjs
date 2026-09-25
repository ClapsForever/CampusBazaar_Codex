import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_CHARS = 2000;
const AGENT_STATUSES = new Set(['completed', 'clarification', 'no_results']);

export class GatewayError extends Error {
  constructor(statusCode, code, message, retryable = false) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('This gateway is a development-only adapter and cannot run in production');
  }
  const config = {
    nodeEnv,
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 3180),
    agentBaseUrl: (env.AGENT_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/u, ''),
    agentServiceToken: env.AGENT_SERVICE_TOKEN ?? '',
    devClientToken: env.DEV_CLIENT_TOKEN ?? '',
    userId: env.AGENT_USER_ID ?? 'u_me',
    schoolId: env.AGENT_SCHOOL_ID ?? 'school_demo',
    timeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? 70000)
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 120000) {
    throw new Error('REQUEST_TIMEOUT_MS must be an integer from 1000 to 120000');
  }
  if (!config.agentServiceToken.trim() || !config.devClientToken.trim()) {
    throw new Error('AGENT_SERVICE_TOKEN and DEV_CLIENT_TOKEN must be configured');
  }
  if (!config.userId.trim() || !config.schoolId.trim()) {
    throw new Error('AGENT_USER_ID and AGENT_SCHOOL_ID must be configured');
  }
  return config;
}

function sendJson(response, statusCode, body) {
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(serialized),
    'cache-control': 'no-store'
  });
  response.end(serialized);
}

function safeTokenMatch(actual, expected) {
  if (typeof actual !== 'string') return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function readJsonBody(request) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.length;
    if (byteLength > MAX_BODY_BYTES) {
      throw new GatewayError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new GatewayError(400, 'BAD_REQUEST', '请求体必须是有效 JSON');
  }
}

function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new GatewayError(400, 'BAD_REQUEST', '请求体必须是 JSON 对象');
  }
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/u.test(body.requestId)) {
    throw new GatewayError(400, 'BAD_REQUEST', 'requestId 格式不正确');
  }
  if (body.sessionId !== null && body.sessionId !== undefined &&
    (typeof body.sessionId !== 'string' || !/^session_[a-zA-Z0-9_-]{1,100}$/u.test(body.sessionId))) {
    throw new GatewayError(400, 'BAD_REQUEST', 'sessionId 格式不正确');
  }
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    throw new GatewayError(400, 'BAD_REQUEST', 'message 不能为空');
  }
  if (body.message.length > MAX_MESSAGE_CHARS) {
    throw new GatewayError(400, 'BAD_REQUEST', `message 不能超过 ${MAX_MESSAGE_CHARS} 个字符`);
  }
  return {
    requestId: body.requestId,
    sessionId: body.sessionId ?? null,
    message: body.message.trim()
  };
}

function isAgentResponse(value) {
  return value !== null && typeof value === 'object' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    AGENT_STATUSES.has(value.status) &&
    typeof value.reply === 'string' &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every((item) => item && typeof item.listingId === 'string' &&
      Array.isArray(item.reasons) && item.reasons.every((reason) => typeof reason === 'string')) &&
    Array.isArray(value.relaxedConditions) &&
    value.relaxedConditions.every((condition) => typeof condition === 'string');
}

function isAgentError(value) {
  return value !== null && typeof value === 'object' &&
    typeof value.requestId === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.retryable === 'boolean';
}

function gatewayErrorBody(error, requestId = 'unknown') {
  if (error instanceof GatewayError) {
    return {
      statusCode: error.statusCode,
      body: { requestId, code: error.code, message: error.message, retryable: error.retryable }
    };
  }
  return {
    statusCode: 503,
    body: {
      requestId,
      code: 'AGENT_UNAVAILABLE',
      message: 'Agent 服务暂时不可用，请检查 Agent 服务是否已启动',
      retryable: true
    }
  };
}

export function createAgentGateway({ config, fetchImpl = globalThis.fetch }) {
  if (!config || config.nodeEnv === 'production' || !config.devClientToken || !config.agentServiceToken) {
    throw new Error('A development config with both gateway and upstream tokens is required');
  }

  return createServer(async (request, response) => {
    let requestId = 'unknown';
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok', service: 'campusbazaar-agent-gateway' });
        return;
      }
      if (request.method !== 'POST' || url.pathname !== '/api/agent/chat') {
        throw new GatewayError(404, 'NOT_FOUND', '接口不存在');
      }
      if (!safeTokenMatch(request.headers['x-campusbazaar-dev-token'], config.devClientToken)) {
        throw new GatewayError(401, 'UNAUTHORIZED', '开发网关令牌无效');
      }
      if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        throw new GatewayError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type 必须是 application/json');
      }

      const body = validateChatRequest(await readJsonBody(request));
      requestId = body.requestId;
      let upstream;
      try {
        upstream = await fetchImpl(`${config.agentBaseUrl}/internal/agent/chat`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-agent-service-token': config.agentServiceToken,
            'x-user-id': config.userId,
            'x-school-id': config.schoolId
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs)
        });
      } catch {
        throw new GatewayError(503, 'AGENT_UNAVAILABLE', 'Agent 服务暂时不可用，请检查 Agent 服务是否已启动', true);
      }

      const text = await upstream.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new GatewayError(502, 'INVALID_AGENT_RESPONSE', 'Agent 服务返回了无法解析的数据', true);
      }
      if (upstream.ok && isAgentResponse(payload)) {
        sendJson(response, 200, payload);
        return;
      }
      if (!upstream.ok && isAgentError(payload)) {
        sendJson(response, upstream.status, payload);
        return;
      }
      throw new GatewayError(502, 'INVALID_AGENT_RESPONSE', 'Agent 服务返回的数据格式不正确', true);
    } catch (error) {
      const result = gatewayErrorBody(error, requestId);
      sendJson(response, result.statusCode, result.body);
    }
  });
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const config = loadConfig();
  const server = createAgentGateway({ config });
  server.listen(config.port, config.host, () => {
    console.info(`CampusBazaar Agent dev gateway listening on http://${config.host}:${config.port}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
