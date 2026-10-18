// Real ArkTS ViewModel + auth service against an isolated real HTTP/SQLite API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const ts = require(require.resolve('typescript', { paths: [path.join(__dirname, '../backend/api')] }));
const root = path.resolve(__dirname, '..');

test('真实前端无验证码注册、读取资料、重复邮箱、退出和重登完整链路', async () => {
  const { createApiApp } = await import(pathToFileURL(path.join(root, 'backend/api/dist/src/server.js')));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-registration-flow-'));
  const app = createApiApp({ mode: 'local', host: '127.0.0.1', port: 0,
    databasePath: path.join(directory, 'flow.sqlite'), uploadDir: path.join(directory, 'uploads'),
    publicBaseUrl: 'http://127.0.0.1:0', sessionSecret: 'registration-flow-isolated-secret-32chars',
    agentBaseUrl: 'http://127.0.0.1:1', agentServiceToken: 'test-agent-service-token-a',
    internalAgentToken: 'test-business-backend-token-b', schoolId: 'school_flow' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let token = '', authService;
  const requests = [], cache = new Map();
  const transport = {
    setToken(value) { token = value; }, clearToken() { token = ''; },
    async request(method, route, body = null, authorized = true) {
      requests.push(route);
      assert(!route.includes('captcha'), 'Registration must not request CAPTCHA');
      const response = await fetch(base + route, { method, headers: {
        ...(body !== null ? { 'content-type': 'application/json' } : {}),
        ...(authorized ? { authorization: `Bearer ${token}` } : {})
      }, ...(body !== null ? { body } : {}) });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.message), { statusCode: response.status });
      return result;
    }
  };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const filename = path.join(root, 'entry/src/main/ets', name + '.ets');
    const source = fs.readFileSync(filename, 'utf8').replace(/@ObservedV2\s*/g, '').replace(/@Trace\s*/g, '');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, { exports, console, require(dependency) {
      if (dependency === '@kit.NetworkKit') return { http: { RequestMethod: { POST: 'POST', GET: 'GET' } } };
      if (dependency.startsWith('@kit.')) return {};
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency));
      if (resolved === 'service/BusinessApiClient') return { businessApiClient: transport };
      if (resolved === 'service/ImageUpload') return {};
      if (resolved === 'service/AuthenticationService' && authService) return { authService };
      return load(resolved);
    } }, { filename });
    return exports;
  }
  try {
    authService = new (load('service/AuthenticationService').HttpAuthenticationService)();
    const AuthViewModel = load('viewmodel/AuthViewModel').AuthViewModel;
    const model = new AuthViewModel();
    model.setRegistering(true);
    assert.equal(requests.length, 0, 'Switching form does not request any challenge');
    model.email = ' Flow.User+Test@Example.COM ';
    model.password = model.confirmPassword = 'FlowPass123'; model.acceptedTerms = true;
    assert.equal(await model.register(), true, model.formError);
    const id = authService.getCurrentUser().id, registeredToken = token;
    assert.equal(authService.getCurrentUser().email, 'flow.user+test@example.com');
    assert.equal((await authService.refreshUser()).id, id);
    assert.equal(model.password, ''); assert.equal(model.confirmPassword, '');
    const row = app.db.prepare('SELECT email_verified_at FROM users WHERE id=?').get(id);
    assert.equal(row.email_verified_at, null);
    assert.equal(app.db.prepare('SELECT privacy_version FROM registration_consents WHERE user_id=?').get(id).privacy_version, '2026-10-18-draft-3');
    await authService.logout(); assert.equal(authService.getCurrentUser(), null); assert.equal(token, '');
    const revoked = await fetch(base + '/api/v1/me', { headers: { authorization: `Bearer ${registeredToken}` } });
    assert.equal(revoked.status, 401);
    const duplicate = new AuthViewModel(); duplicate.setRegistering(true);
    duplicate.email = 'flow.user+test@example.com'; duplicate.password = duplicate.confirmPassword = 'FlowPass123';
    duplicate.acceptedTerms = true;
    assert.equal(await duplicate.register(), false); assert.match(duplicate.formError, /已注册/);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    const login = new AuthViewModel(); login.email = 'FLOW.USER+TEST@EXAMPLE.COM'; login.password = 'FlowPass123';
    assert.equal(await login.login(), true, login.formError);
    assert.equal((await authService.refreshUser()).id, id);
    assert.equal((await transport.request('GET', '/api/v1/products')).items.length, 0);
    await authService.logout();
    console.log('Registration flow data retained:', directory);
  } finally { await app.close(); }
});
