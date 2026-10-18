// Execute the real ArkTS registration logic with transport doubles; no device is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require(process.env.ARK_TYPESCRIPT || require.resolve('typescript', {
  paths: [path.join(__dirname, '../backend/api')]
}));
const root = path.resolve(__dirname, '../entry/src/main/ets');

function harness(overrides = {}, runtime = {}) {
  const cache = new Map();
  function load(name) {
    if (overrides[name]) return overrides[name];
    if (name.startsWith('@kit.')) return {};
    const filename = path.join(root, `${name}.ets`);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = fs.readFileSync(filename, 'utf8').replace(/@ObservedV2\s*/g, '').replace(/@Trace\s*/g, '');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(output, {
      exports,
      require: dependency => {
        if (overrides[dependency]) return overrides[dependency];
        if (dependency.startsWith('@kit.')) return {};
        return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency)));
      },
      setTimeout, clearTimeout, console, ...runtime
    }, { filename });
    return exports;
  }
  return load;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function modelWith(service = {}) {
  return new (harness({ 'service/AuthenticationService': { authService: service } })('viewmodel/AuthViewModel').AuthViewModel)();
}
function validForm(model) {
  Object.assign(model, { registering: true, email: ' Student@EXAMPLE.COM ', password: 'Campus123', confirmPassword: 'Campus123', acceptedTerms: true });
  return model;
}
function authenticationWith(request) {
  const tokens = [];
  const load = harness({
    '@kit.NetworkKit': { http: { RequestMethod: { POST: 'POST', GET: 'GET' } } },
    'service/ImageUpload': {},
    'service/BusinessApiClient': { businessApiClient: { request, setToken: token => tokens.push(token), clearToken: () => tokens.push('') } }
  });
  return { service: new (load('service/AuthenticationService').HttpAuthenticationService)(), tokens };
}

test('注册仅校验邮箱、密码、确认密码及主动同意，协议默认不勾选', async t => {
  assert.equal(modelWith().acceptedTerms, false);
  for (const [name, changes, errorField] of [
    ['邮箱格式', { email: 'invalid' }, 'emailError'],
    ['邮箱本地部分过长', { email: 'a'.repeat(65) + '@example.com' }, 'emailError'],
    ['密码不足六位', { password: 'short', confirmPassword: 'short' }, 'passwordError'],
    ['密码超过64位', { password: 'a'.repeat(65), confirmPassword: 'a'.repeat(65) }, 'passwordError'],
    ['全空白密码', { password: ' '.repeat(6), confirmPassword: ' '.repeat(6) }, 'passwordError'],
    ['确认密码不一致', { confirmPassword: 'other' }, 'confirmPasswordError'],
    ['确认密码为空', { confirmPassword: '' }, 'confirmPasswordError'],
    ['未主动同意', { acceptedTerms: false }, 'consentError']
  ]) {
    await t.test(name, async () => {
      let calls = 0;
      const model = validForm(modelWith({ registerByPassword: async () => { calls++; } }));
      Object.assign(model, changes);
      assert.equal(await model.register(), false); assert(model[errorField]); assert.equal(calls, 0);
    });
  }
});

test('无需验证码即可注册，6和64位密码均支持', async () => {
  for (const length of [6, 64]) {
    let submitted;
    const model = validForm(modelWith({ registerByPassword: async (...args) => { submitted = args; } }));
    model.password = model.confirmPassword = 'a'.repeat(length);
    assert.equal(await model.register(), true);
    assert.deepEqual(submitted, ['student@example.com', 'a'.repeat(length)]);
  }
});

test('切换注册不请求验证码，切换登录清除密码及同意状态', () => {
  let captchaCalls = 0;
  const model = modelWith({ getRegistrationCaptcha: () => { captchaCalls++; throw new Error('must not request'); } });
  model.email = 'student@example.com'; model.setRegistering(true);
  assert.equal(model.registering, true); assert.equal(captchaCalls, 0); assert.equal(model.acceptedTerms, false);
  model.password = model.confirmPassword = 'Campus123'; model.acceptedTerms = true;
  model.setRegistering(false);
  assert.equal(model.password, ''); assert.equal(model.confirmPassword, ''); assert.equal(model.acceptedTerms, false);
  assert.equal(model.email, 'student@example.com'); assert.equal(captchaCalls, 0);
});

test('注册只提交一次，成功后清空密码，提交中不能切换表单', async () => {
  const response = deferred(); let calls = 0;
  const model = validForm(modelWith({ registerByPassword: async () => { calls++; return response.promise; } }));
  const pending = model.register();
  assert.equal(await model.register(), false); assert.equal(calls, 1); assert.equal(model.loggingIn, true);
  model.setRegistering(false); assert.equal(model.registering, true);
  response.resolve({ id: 'registered' }); assert.equal(await pending, true);
  assert.equal(model.password, ''); assert.equal(model.confirmPassword, ''); assert.equal(model.loggingIn, false);
});

test('注册失败保留输入且允许重试，不自动重复请求', async () => {
  let calls = 0, fail = true;
  const model = validForm(modelWith({ registerByPassword: async () => {
    calls++; if (fail) throw new Error('该邮箱已注册，请登录'); return { id: 'registered' };
  } }));
  assert.equal(await model.register(), false); assert.equal(calls, 1);
  assert.equal(model.email, ' Student@EXAMPLE.COM '); assert.equal(model.password, 'Campus123');
  assert.equal(model.confirmPassword, 'Campus123'); assert.equal(model.loggingIn, false);
  assert.equal(model.formError, '该邮箱已注册，请登录');
  fail = false; assert.equal(await model.register(), true); assert.equal(calls, 2); assert.equal(model.formError, '');
});

test('匿名注册只发送邮箱密码和当前协议版本，不发送验证码', async () => {
  const requests = [];
  const { service, tokens } = authenticationWith(async (method, route, body, authenticated) => {
    requests.push({ method, route, body: JSON.parse(body), authenticated });
    return { user: { id: 'registered' }, token: 'registration-token' };
  });
  assert.equal((await service.registerByPassword(' Student@EXAMPLE.COM ', 'Campus123')).id, 'registered');
  assert.deepEqual(requests, [{ method: 'POST', route: '/api/v1/auth/registrations', authenticated: false,
    body: { email: 'student@example.com', password: 'Campus123', agreementVersion: '2026-10-18-draft-2', privacyVersion: '2026-10-18-draft-2' } }]);
  assert.deepEqual(tokens, ['registration-token']); assert.equal(service.getCurrentUser().id, 'registered');
});

test('退出或新登录使旧注册响应失效，不能恢复旧会话', async () => {
  for (const action of ['logout', 'login']) {
    const response = deferred();
    const { service, tokens } = authenticationWith(async (_method, route) => {
      if (route.endsWith('/registrations')) return response.promise;
      if (route.endsWith('/logout')) return { ok: true };
      return { user: { id: 'new-login' }, token: 'login-token' };
    });
    const pending = service.registerByPassword('student@example.com', 'Campus123');
    const rejected = assert.rejects(pending, /登录状态已改变/);
    if (action === 'logout') await service.logout(); else await service.loginByPassword('other@example.com', 'Campus123');
    response.resolve({ user: { id: 'stale' }, token: 'stale-token' }); await rejected;
    assert.equal(service.getCurrentUser()?.id ?? null, action === 'logout' ? null : 'new-login');
    assert(!tokens.includes('stale-token'));
  }
});

test('较新注册优先于旧登录，缺少身份或令牌的响应不保存会话', async () => {
  const oldLogin = deferred();
  const { service, tokens } = authenticationWith(async (_method, route) => route.endsWith('/sessions') ? oldLogin.promise :
    { user: { id: 'registered' }, token: 'registration-token' });
  const pending = service.loginByPassword('old@example.com', 'Campus123');
  const rejected = assert.rejects(pending, /登录状态已改变/);
  await service.registerByPassword('student@example.com', 'Campus123');
  oldLogin.resolve({ user: { id: 'old' }, token: 'old-token' }); await rejected;
  assert.equal(service.getCurrentUser().id, 'registered'); assert.deepEqual(tokens, ['registration-token']);
  for (const malformed of [{ user: { id: 'x' } }, { token: 'bad-token' }]) {
    const fixture = authenticationWith(async () => malformed);
    await assert.rejects(fixture.service.registerByPassword('student@example.com', 'Campus123'), /注册响应格式不正确/);
    assert.equal(fixture.service.getCurrentUser(), null); assert.deepEqual(fixture.tokens, []);
  }
});
