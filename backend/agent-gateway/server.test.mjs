import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createAgentGateway } from './server.mjs';

const config = {
  nodeEnv: 'development',
  agentBaseUrl: 'http://agent.test',
  agentServiceToken: 'server-only-secret',
  devClientToken: 'local-dev-token',
  userId: 'u_me',
  schoolId: 'school_demo',
  timeoutMs: 1000
};

const servers = [];

async function startGateway(fetchImpl) {
  const server = createAgentGateway({ config, fetchImpl });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

function requestOptions(token = config.devClientToken, body = {
  requestId: 'cb_123_1',
  sessionId: null,
  message: '50 元以内的高数教材'
}) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-campusbazaar-dev-token': token
    },
    body: JSON.stringify(body)
  };
}

test('health endpoint is available without exposing upstream credentials', async () => {
  const baseUrl = await startGateway(async () => {
    throw new Error('health must not call the upstream');
  });
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'campusbazaar-agent-gateway' });
});

test('chat forwards the upstream service token and trusted identity, then returns the common DTO', async () => {
  let forwarded;
  const upstreamResponse = {
    requestId: 'cb_123_1',
    sessionId: 'session_abc',
    status: 'completed',
    reply: '找到一件商品。',
    recommendations: [{ listingId: 'listing_math_001', reasons: ['符合预算'] }],
    relaxedConditions: []
  };
  const baseUrl = await startGateway(async (url, options) => {
    forwarded = { url, options };
    return new Response(JSON.stringify(upstreamResponse), { status: 200 });
  });

  const response = await fetch(`${baseUrl}/api/agent/chat`, requestOptions());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), upstreamResponse);
  assert.equal(forwarded.url, 'http://agent.test/internal/agent/chat');
  assert.equal(forwarded.options.headers['x-agent-service-token'], 'server-only-secret');
  assert.equal(forwarded.options.headers['x-user-id'], 'u_me');
  assert.equal(forwarded.options.headers['x-school-id'], 'school_demo');
  assert.deepEqual(JSON.parse(forwarded.options.body), {
    requestId: 'cb_123_1', sessionId: null, message: '50 元以内的高数教材'
  });
});

test('invalid client token is rejected before calling the Agent service', async () => {
  let called = false;
  const baseUrl = await startGateway(async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  const response = await fetch(`${baseUrl}/api/agent/chat`, requestOptions('wrong-token'));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'UNAUTHORIZED');
  assert.equal(called, false);
});

test('invalid chat payload is rejected with the common error envelope', async () => {
  let called = false;
  const baseUrl = await startGateway(async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  const response = await fetch(`${baseUrl}/api/agent/chat`, requestOptions(config.devClientToken, {
    requestId: 'bad request id', sessionId: null, message: 'query'
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'BAD_REQUEST');
  assert.equal(called, false);
});

test('Agent error envelope is preserved instead of being treated as no results', async () => {
  const errorBody = {
    requestId: 'cb_123_1', code: 'MODEL_UNAVAILABLE', message: '模型暂不可用', retryable: true
  };
  const baseUrl = await startGateway(async () => new Response(JSON.stringify(errorBody), { status: 503 }));
  const response = await fetch(`${baseUrl}/api/agent/chat`, requestOptions());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), errorBody);
});
