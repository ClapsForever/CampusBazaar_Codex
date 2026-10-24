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

function modelWith(service = {}, runtime = {}) {
  return new (harness({ 'service/AuthenticationService': { authService: service } }, runtime)('viewmodel/AuthViewModel').AuthViewModel)();
}
const verificationId = 'emailv_' + 'a'.repeat(32);
const issued = (overrides = {}) => ({ verificationId, expiresAt: Date.now() + 300000, expiresIn: 300, resendAfter: 60, ...overrides });
function validForm(model) {
  Object.assign(model, { registering: true, email: ' Student@EXAMPLE.COM ', password: 'Campus123', confirmPassword: 'Campus123', acceptedTerms: true,
    verificationId, verificationEmail: 'student@example.com', verificationExpiresAt: Date.now() + 300000, emailCode: '012345' });
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

test('注册校验邮箱、密码、验证码及主动同意，协议默认不勾选', async t => {
  assert.equal(modelWith().acceptedTerms, false);
  for (const [name, changes, errorField] of [
    ['邮箱格式', { email: 'invalid' }, 'emailError'],
    ['邮箱本地部分过长', { email: 'a'.repeat(65) + '@example.com' }, 'emailError'],
    ['密码不足六位', { password: 'short', confirmPassword: 'short' }, 'passwordError'],
    ['密码超过64位', { password: 'a'.repeat(65), confirmPassword: 'a'.repeat(65) }, 'passwordError'],
    ['全空白密码', { password: ' '.repeat(6), confirmPassword: ' '.repeat(6) }, 'passwordError'],
    ['确认密码不一致', { confirmPassword: 'other' }, 'confirmPasswordError'],
    ['确认密码为空', { confirmPassword: '' }, 'confirmPasswordError'],
    ['未主动同意', { acceptedTerms: false }, 'consentError'],
    ['未获取验证码', { verificationId: '' }, 'verificationError'],
    ['验证码不足六位', { emailCode: '12345' }, 'verificationError'],
    ['验证码包含非数字', { emailCode: '12345x' }, 'verificationError'],
    ['验证码邮箱不匹配', { verificationEmail: 'other@example.com' }, 'verificationError'],
    ['验证码已过期', { verificationExpiresAt: Date.now() - 1 }, 'verificationError']
  ]) {
    await t.test(name, async () => {
      let calls = 0;
      const model = validForm(modelWith({ registerByPassword: async () => { calls++; } }));
      Object.assign(model, changes);
      assert.equal(await model.register(), false); assert(model[errorField]); assert.equal(calls, 0);
    });
  }
});

test('注册保留六位验证码的前导零及密码长度边界', async () => {
  for (const length of [6, 64]) {
    let submitted;
    const model = validForm(modelWith({ registerByPassword: async (...args) => { submitted = args; } }));
    model.password = model.confirmPassword = 'a'.repeat(length);
    assert.equal(await model.register(), true);
    assert.deepEqual(submitted, ['student@example.com', 'a'.repeat(length), verificationId, '012345']);
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

test('客户端匿名发码和注册提交挑战ID、验证码及当前协议版本', async () => {
  const requests = [];
  const { service, tokens } = authenticationWith(async (method, route, body, authenticated) => {
    requests.push({ method, route, body: JSON.parse(body), authenticated });
    if (route.endsWith('/email-verifications')) return issued();
    return { user: { id: 'registered' }, token: 'registration-token' };
  });
  assert.equal((await service.sendRegistrationEmail(' Student@EXAMPLE.COM ')).verificationId, verificationId);
  assert.equal(tokens.length, 0, '发码不修改登录会话');
  assert.equal((await service.registerByPassword(' Student@EXAMPLE.COM ', 'Campus123', verificationId, '012345')).id, 'registered');
  assert.deepEqual(requests, [
    { method: 'POST', route: '/api/v1/auth/email-verifications', authenticated: false,
      body: { email: 'student@example.com', purpose: 'register' } },
    { method: 'POST', route: '/api/v1/auth/registrations', authenticated: false,
      body: { email: 'student@example.com', password: 'Campus123', emailVerificationId: verificationId, emailCode: '012345',
        agreementVersion: '2026-10-23-draft-4', privacyVersion: '2026-10-23-draft-4' } }]);
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
    const pending = service.registerByPassword('student@example.com', 'Campus123', verificationId, '012345');
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
  await service.registerByPassword('student@example.com', 'Campus123', verificationId, '012345');
  oldLogin.resolve({ user: { id: 'old' }, token: 'old-token' }); await rejected;
  assert.equal(service.getCurrentUser().id, 'registered'); assert.deepEqual(tokens, ['registration-token']);
  for (const malformed of [{ user: { id: 'x' } }, { token: 'bad-token' }]) {
    const fixture = authenticationWith(async () => malformed);
    await assert.rejects(fixture.service.registerByPassword('student@example.com', 'Campus123', verificationId, '012345'), /注册响应格式不正确/);
    assert.equal(fixture.service.getCurrentUser(), null); assert.deepEqual(fixture.tokens, []);
  }
});

test('发码只提交一次，服务端倒计时按实际时间恢复，大小写与空格不使验证码失效', async () => {
  let now = Date.now(), calls = 0;
  class Clock extends Date { static now() { return now; } }
  const response = deferred();
  const model = modelWith({ async sendRegistrationEmail(email) { calls++; assert.equal(email, 'student@example.com'); return response.promise; } }, { Date: Clock });
  model.setRegistering(true); model.setEmail(' Student@EXAMPLE.COM ');
  const pending = model.sendEmailCode();
  assert.equal(await model.sendEmailCode(), false); assert.equal(calls, 1);
  assert.equal(await model.register(), false, '发送中禁止提交注册');
  response.resolve(issued({ resendAfter: 87 })); assert.equal(await pending, true);
  assert.equal(model.resendSeconds, 87); assert.equal(model.sendingCode, false);
  model.emailCode = '012345'; model.setEmail('student@example.com');
  assert.equal(model.verificationId, verificationId); assert.equal(model.emailCode, '012345');
  now += 63500; model.refreshCooldown(); assert.equal(model.resendSeconds, 24);
  assert.equal(await model.sendEmailCode(), false); assert.equal(calls, 1);
  now += 24000; model.refreshCooldown(); assert.equal(model.resendSeconds, 0);
});

test('修改邮箱后，迟到的旧发码成功或失败都不覆盖新请求', async () => {
  for (const failOld of [false, true]) {
    const old = deferred(), fresh = deferred(); let calls = 0;
    const model = modelWith({ sendRegistrationEmail: () => (++calls === 1 ? old : fresh).promise });
    model.setRegistering(true); model.setEmail('old@example.com'); const first = model.sendEmailCode();
    model.setEmail('new@example.com'); const second = model.sendEmailCode();
    if (failOld) old.reject(new Error('旧请求失败')); else old.resolve(issued());
    assert.equal(await first, false); assert.equal(model.sendingCode, true); assert.equal(model.verificationError, '');
    const newId = 'emailv_' + 'b'.repeat(32); fresh.resolve(issued({ verificationId: newId }));
    assert.equal(await second, true); assert.equal(model.verificationId, newId); assert.equal(model.verificationEmail, 'new@example.com');
    assert.equal(model.sendingCode, false);
  }
});

test('切换登录或离开页面丢弃发码响应，返回表单不会恢复旧挑战', async () => {
  for (const action of ['login', 'dispose']) {
    const response = deferred(); const model = modelWith({ sendRegistrationEmail: () => response.promise });
    model.setRegistering(true); model.setEmail('student@example.com'); const pending = model.sendEmailCode();
    if (action === 'login') { model.setRegistering(false); model.setRegistering(true); } else model.dispose();
    response.resolve(issued()); assert.equal(await pending, false);
    assert.equal(model.verificationId, ''); assert.equal(model.resendSeconds, 0); assert.equal(model.sendingCode, false);
  }
});

test('重发立即清除旧验证码，发送失败保留其他输入且不自动重试', async () => {
  let calls = 0;
  const model = validForm(modelWith({ async sendRegistrationEmail() { calls++; throw Object.assign(new Error('邮件暂不可用'), { statusCode: 503 }); } }));
  assert.equal(await model.sendEmailCode(), false); assert.equal(calls, 1);
  assert.equal(model.verificationId, ''); assert.equal(model.emailCode, '');
  assert.equal(model.password, 'Campus123'); assert.equal(model.confirmPassword, 'Campus123'); assert.equal(model.acceptedTerms, true);
  assert.equal(model.verificationError, '邮件暂不可用'); assert.equal(model.sendingCode, false);
  assert.equal(await model.register(), false); assert.match(model.verificationError, /获取/);
});

test('发码429遵守服务端retryAfter，代理未返回等待时间时使用保守冷却', async () => {
  for (const retryAfter of [123, undefined]) {
    let calls = 0;
    const model = validForm(modelWith({ async sendRegistrationEmail() { calls++; throw Object.assign(new Error('发送过于频繁'), { statusCode: 429, retryAfter }); } }));
    assert.equal(await model.sendEmailCode(), false); assert.equal(model.resendSeconds, retryAfter ?? 60);
    assert.equal(await model.sendEmailCode(), false); assert.equal(calls, 1);
  }
});

test('验证码错误显示在验证码区域并保留表单，用户可以手动修正', async () => {
  const model = validForm(modelWith({ async registerByPassword() { throw Object.assign(new Error('验证码错误或已失效'), { code: 'EMAIL_CODE_INVALID' }); } }));
  assert.equal(await model.register(), false); assert.equal(model.formError, '');
  assert.equal(model.verificationError, '验证码错误或已失效'); assert.equal(model.emailCode, '012345');
  assert.equal(model.password, 'Campus123'); assert.equal(model.acceptedTerms, true);
});

test('发码服务拒绝异常响应，不生成可提交的挑战', async () => {
  for (const response of [null, {}, issued({ verificationId: 'wrong' }), issued({ expiresIn: 0 }), issued({ resendAfter: -1 })]) {
    const { service } = authenticationWith(async () => response);
    await assert.rejects(service.sendRegistrationEmail('student@example.com'), /响应格式/);
  }
});

test('HTTP客户端保留错误码与JSON/大小写响应头的Retry-After，包括代理HTML错误', async () => {
  for (const response of [
    { responseCode: 429, result: JSON.stringify({ message: '请等待', code: 'EMAIL_SEND_RATE_LIMITED', retryAfter: 71 }), header: { 'retry-after': '90' } },
    { responseCode: 429, result: '<html>rate limited</html>', header: { 'Retry-After': '120' } },
    { responseCode: 503, result: JSON.stringify({ message: '邮件暂不可用', code: 'EMAIL_DELIVERY_UNAVAILABLE' }), header: {} }
  ]) {
    let destroyed = false;
    const load = harness({ '@kit.NetworkKit': { http: { RequestMethod: { POST: 'POST' }, HttpDataType: { STRING: 'STRING' },
      createHttp: () => ({ async request() { return response; }, destroy() { destroyed = true; } }) } } });
    const client = new (load('service/BusinessApiClient').BusinessApiClient)();
    await assert.rejects(client.request('POST', '/api/v1/auth/email-verifications', '{}', false), error => {
      assert.equal(error.statusCode, response.responseCode);
      assert.equal(error.retryAfter, response.responseCode === 503 ? 0 : response.header['retry-after'] ? 90 : 120);
      if (response.responseCode === 503) assert.equal(error.code, 'EMAIL_DELIVERY_UNAVAILABLE');
      return true;
    });
    assert.equal(destroyed, true);
  }
});
