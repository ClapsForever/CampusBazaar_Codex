// Real-model evaluation against an isolated SQLite catalog and the actual HTTP API.
// No production DB is opened; no service is started/stopped; env values are never logged.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
if (!args.includes('--real') && !args.includes('--mock')) {
  console.error('Specify --real (uses configured model API) or --mock (harness smoke check only).');
  process.exit(2);
}
const projectRoot = resolve(arg('--project-root', fileURLToPath(new URL('../../../', import.meta.url))));
const casesFile = resolve(arg('--cases', fileURLToPath(new URL('../evals/paraphrase-cases.json', import.meta.url))));
const output = resolve(arg('--output', resolve(tmpdir(), `campusbazaar-paraphrases-${Date.now()}.json`)));
const concurrency = Number(arg('--concurrency', '2'));
assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 2, 'Concurrency must be 1 or 2');
const selectedIds = arg('--only', '').split(',').filter(Boolean);
const dataset = JSON.parse(readFileSync(casesFile, 'utf8'));
const cases = selectedIds.length ? dataset.cases.filter(c => selectedIds.includes(c.id)) : dataset.cases;
assert.ok(cases.length > 0 && cases.length <= 100, 'Expected 1–100 selected cases');
if (selectedIds.length) assert.equal(cases.length, selectedIds.length, 'Unknown/duplicate --only case');
const importProject = (path) => import(pathToFileURL(resolve(projectRoot, path)).href);
const [{ createApiApp }, { loadConfig }, { runAgentTurn }, { HttpBusinessClient }, { MemorySessionStore }] = await Promise.all([
  importProject('backend/api/dist/src/server.js'),
  importProject('backend/agent/dist/config/index.js'),
  importProject('backend/agent/dist/agent/service.js'),
  importProject('backend/agent/dist/clients/http.js'),
  importProject('backend/agent/dist/sessions/store.js'),
]);
const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent',
  MODEL_MODE: args.includes('--real') ? 'real' : 'mock', MOCK_BACKEND: 'false' });
if (config.modelMode === 'real') assert.ok(config.modelApiKey, 'MODEL_API_KEY must be configured privately');
// All identity, preference and product data passed to the model is synthetic.
const syntheticConfig = {
  mode: 'local', host: '127.0.0.1', port: 0, databasePath: ':memory:', uploadDir: tmpdir(),
  publicBaseUrl: 'http://127.0.0.1', sessionSecret: 'synthetic-eval-secret-longer-than-thirty-two-characters',
  agentBaseUrl: 'http://127.0.0.1:1',
  agentServiceToken: 'synthetic-eval-agent-token', internalAgentToken: 'synthetic-eval-read-token',
  schoolId: 'school_synthetic_paraphrase',
};
const print = console.log.bind(console);
console.log = (...values) => {
  // The isolated API emits request logs; compact per-case records below replace them.
  if (typeof values[0] === 'string' && values[0].includes('"event":"http_request"')) return;
  print(...values);
};
const app = createApiApp(syntheticConfig);
await new Promise((resolve, reject) => {
  app.server.once('error', reject);
  app.server.listen(0, '127.0.0.1', resolve);
});
// Synthetic identity, independent of public registration and obsolete SMS login.
const user = { userId: 'user_synthetic_eval', schoolId: syntheticConfig.schoolId };
app.db.prepare('INSERT INTO users(id,email,nickname,avatar,school_id,created_at) VALUES(?,?,?,?,?,?)')
  .run(user.userId, 'synthetic-eval@example.invalid', '合成评测用户', '', user.schoolId, Date.now());
const insert = app.db.prepare(`INSERT INTO products
  (id,seller_id,school_id,title,description,price_cents,category,condition,campus,version,status,published_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,'ACTIVE',?)`);
dataset.fixtures.forEach((p, i) => insert.run(p.id, user.userId, user.schoolId, p.title, p.description,
  Math.round(p.price * 100), p.category, p.condition, p.campus, p.version ?? null, i + 1));
const client = new HttpBusinessClient({
  baseUrl: `http://127.0.0.1:${app.server.address().port}`, token: syntheticConfig.internalAgentToken,
  searchPath: '/internal/listings/search', detailPath: '/internal/listings/{listingId}',
  preferencesPath: '/internal/users/preferences', timeoutMs: config.toolTimeoutMs,
});
const context = new AsyncLocalStorage();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const trace = context.getStore();
  const url = String(input instanceof Request ? input.url : input);
  const response = await originalFetch(input, init);
  if (trace && url.startsWith(config.modelBaseUrl) && init?.body) {
    const body = JSON.parse(String(init.body));
    const prompt = body.messages.at(-1)?.content;
    let payload;
    try { payload = JSON.parse(prompt); } catch { /* provider shape may vary */ }
    const stage = payload && Object.hasOwn(payload, 'message') ? 'plan' : 'reply';
    const record = { stage };
    trace.model.push(record);
    // Read a clone, preserving exactly the stream seen by the SDK. Never record headers/env.
    trace.pending.push(response.clone().text().then(text => {
      let content = '';
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          content += chunk.choices?.[0]?.delta?.content ?? '';
          if (chunk.usage) record.usage = chunk.usage;
        } catch { /* ignore heartbeat/non-JSON lines */ }
      }
      if (stage === 'plan') {
        record.rawPlan = content;
        try { record.plan = JSON.parse(content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')); }
        catch { record.invalidJson = true; }
      }
    }).catch(() => { record.captureFailed = true; }));
  }
  return response;
};
const tracedClient = {
  async searchListings(input, identity, signal) {
    const call = { tool: 'searchListings', input: { ...input } };
    context.getStore()?.tools.push(call);
    const result = await client.searchListings(input, identity, signal);
    Object.assign(call, { ids: result.listings.map(p => p.listingId), total: result.total,
      page: result.page, hasMore: result.hasMore });
    return result;
  },
  async getListingDetail(id, identity, signal) {
    context.getStore()?.tools.push({ tool: 'getListingDetail', listingId: id });
    return client.getListingDetail(id, identity, signal);
  },
  async getUserPreferences(identity, signal) {
    context.getStore()?.tools.push({ tool: 'getUserPreferences' });
    return client.getUserPreferences(identity, signal);
  },
};
function grade(result, expected) {
  const problems = [];
  if (result.error) return [`调用失败：${result.error.code}`];
  const response = result.response;
  if (expected.status && response.status !== expected.status) problems.push(`状态应为 ${expected.status}，实际 ${response.status}`);
  const ids = response.recommendations.map(p => p.listingId);
  if (expected.ids) {
    const want = expected.ordered ? expected.ids : [...expected.ids].sort();
    const got = expected.ordered ? ids : [...ids].sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) problems.push(`商品应为 ${expected.ids.join(', ') || '空'}，实际 ${ids.join(', ') || '空'}`);
  }
  for (const [key, value] of Object.entries(expected.filters ?? {})) {
    if (result.filters[key] !== value) problems.push(`${key} 应为 ${JSON.stringify(value)}，实际 ${JSON.stringify(result.filters[key]) ?? '未设置'}`);
  }
  for (const key of expected.absentFilters ?? []) if (Object.hasOwn(result.filters, key)) problems.push(`${key} 应已取消，实际仍为 ${JSON.stringify(result.filters[key])}`);
  if (expected.page && result.searchPage !== expected.page) problems.push(`页码应为 ${expected.page}，实际 ${result.searchPage}`);
  if (expected.action && result.action !== expected.action) problems.push(`意图应为 ${expected.action}，实际 ${result.action}`);
  if (expected.noTools && result.tools.length) problems.push('该轮应不调用工具');
  if (expected.replyPattern && !new RegExp(expected.replyPattern, 'u').test(response.reply)) problems.push('回复未包含期望说明');
  return problems;
}
const sessions = new MemorySessionStore(3_600_000);
const stateKeys = ['messages', 'filters', 'needs', 'displayedListingIds', 'displayedProducts', 'searchPage'];
async function turn(message, session) {
  const trace = { model: [], tools: [], pending: [], action: undefined };
  const started = Date.now();
  let result;
  try {
    result = await context.run(trace, () => runAgentTurn(message, {
      config, client: tracedClient, session, user, requestId: `req_eval_${randomUUID()}`,
      log: (event, value) => { if (event === 'business_intent') trace.action = value.action; },
    }));
    for (const key of stateKeys) session[key] = result[key];
  } catch (error) {
    result = { error: { code: error.code ?? error.name, message: error.message } };
  }
  await Promise.all(trace.pending);
  // Conversation messages are committed to the test session above; do not duplicate them in artifacts.
  delete result.messages;
  return { message, ...result, action: trace.action, tools: trace.tools, model: trace.model,
    elapsedMs: Date.now() - started };
}
const report = {
  startedAt: new Date().toISOString(), modelMode: config.modelMode, provider: config.modelProvider,
  modelName: config.modelName, temperature: 0, maxResults: config.maxResults, turnTimeoutMs: config.turnTimeoutMs,
  nodeVersion: process.version,
  projectRoot, datasetSha256: createHash('sha256').update(readFileSync(casesFile)).digest('hex'),
  sourceHashes: Object.fromEntries([
    'backend/agent/dist/agent/service.js', 'backend/agent/dist/agent/policy.js',
    'backend/agent/dist/agent/prompts.js', 'backend/agent/dist/intent/parser.js',
    'backend/api/dist/src/store.js', 'backend/api/dist/src/search.js',
  ].map(path => [path, createHash('sha256').update(readFileSync(resolve(projectRoot, path))).digest('hex')])),
  catalog: dataset.fixtures, presets: [], cases: [],
};
function save() {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
async function workers(items, handle) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) { const item = items[cursor++]; await handle(item); }
  }));
}
try {
  const presetStates = new Map();
  const needed = [...new Set(cases.map(c => c.preset).filter(Boolean))];
  await workers(needed, async name => {
    const preset = dataset.presets[name];
    const session = sessions.create(user);
    const result = await turn(preset.message, session);
    const problems = grade(result, preset.expect);
    report.presets.push({ name, result, problems });
    if (!problems.length) presetStates.set(name, Object.fromEntries(stateKeys.map(key => [key, structuredClone(session[key])])));
    print(JSON.stringify({ preset: name, passed: !problems.length, problems }));
    save();
  });
  await workers(cases, async c => {
    const session = sessions.create(user);
    if (c.preset && !presetStates.has(c.preset)) {
      const entry = { ...c, blocked: true, passed: false, problems: [`前置对话 ${c.preset} 未通过，未执行本例`] };
      report.cases.push(entry); save(); print(JSON.stringify({ case: c.id, blocked: true })); return;
    }
    if (c.preset) Object.assign(session, structuredClone(presetStates.get(c.preset)));
    const result = await turn(c.message, session);
    const problems = grade(result, c.expect);
    report.cases.push({ ...c, result, passed: !problems.length, problems });
    save();
    print(JSON.stringify({ case: c.id, scope: c.scope, passed: !problems.length, message: c.message,
      status: result.response?.status, filters: result.filters, action: result.action, elapsedMs: result.elapsedMs, problems }));
  });
  report.cases.sort((a, b) => cases.findIndex(c => c.id === a.id) - cases.findIndex(c => c.id === b.id));
  report.completedAt = new Date().toISOString();
  report.summary = Object.fromEntries(['core', 'extension'].map(scope => {
    const rows = report.cases.filter(c => c.scope === scope);
    return [scope, { total: rows.length, passed: rows.filter(c => c.passed).length,
      failed: rows.filter(c => !c.passed && !c.blocked).length, blocked: rows.filter(c => c.blocked).length }];
  }));
  report.modelRequests = [...report.presets.map(p => p.result), ...report.cases.map(c => c.result).filter(Boolean)]
    .reduce((n, result) => n + result.model.length, 0);
  save();
  print(JSON.stringify({ summary: report.summary, modelRequests: report.modelRequests, output }));
  if (report.cases.some(c => !c.passed)) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  console.log = print;
  await app.close();
}
