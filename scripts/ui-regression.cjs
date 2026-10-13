// Execute the actual ArkTS ViewModels with service/Kit doubles; no device is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require(process.env.ARK_TYPESCRIPT || 'typescript');
const root = path.resolve(__dirname, '../entry/src/main/ets');
function harness(overrides = {}) {
  const cache = new Map();
  function load(name) {
    if (overrides[name]) return overrides[name];
    if (name.startsWith('@kit.')) return {};
    const filename = path.join(root, `${name}.ets`);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = fs.readFileSync(filename, 'utf8').replace(/@ObservedV2\s*/g, '').replace(/@Trace\s*/g, '');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, { exports, require: dependency => {
      if (dependency.startsWith('@kit.')) return {};
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency)));
    }, setTimeout, clearTimeout, console }, { filename });
    return exports;
  }
  return load;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const product = { id: 'listing_1', title: '蓝牙耳机', category: '耳机', campus: '江湾校区', images: [], price: 20 };

test('发布与首页共用六类，兼容旧小类和大类别名', () => {
  const { homeCategory, HOME_CATEGORIES, PRODUCT_CATEGORIES, CAMPUS_OPTIONS } = harness()('common/MarketOptions');
  for (const [value, expected] of [['耳机','外设'], ['键盘','外设'], ['显示器','外设'], ['计算器','数码'],
    ['自行车','运动'], ['单车','运动'], ['生活用品','日用'], ['教材','教材'], ['数码','数码'],
    ['生活','日用'], ['出行','运动'], ['未知','其他'], ['', '其他'], [undefined,'其他']]) {
    assert.equal(homeCategory(value), expected);
  }
  assert.equal(PRODUCT_CATEGORIES.map(option => option.value).join(','), '教材,数码,外设,日用,运动,其他');
  assert.equal(HOME_CATEGORIES.join(','), '全部,教材,数码,外设,日用,运动,其他');
  assert.equal(CAMPUS_OPTIONS.join(','), '江湾校区,邯郸校区,张江校区,枫林校区');
});

test('首页较旧请求完成时不能覆盖新结果', async () => {
  const old = deferred(), fresh = deferred(); let count = 0;
  const load = harness({ 'service/ProductService': { productService: { getProductFeed: () => (++count === 1 ? old : fresh).promise } } });
  const model = new (load('viewmodel/BuyerHomeViewModel').BuyerHomeViewModel)();
  const a = model.loadFeed(), b = model.loadFeed(true);
  fresh.resolve([product]); await b;
  old.resolve([]); await a;
  assert.equal(model.products[0].id, product.id);
  assert.equal(model.feedState, load('common/Constants').LoadState.CONTENT);
});

test('静默失败保留商品、首次失败显示错误、重试恢复、相同结果保留数组', async () => {
  let result = [product], fails = false;
  const load = harness({ 'service/ProductService': { productService: { getProductFeed: async () => {
    if (fails) throw new Error('offline'); return result;
  } } } });
  const model = new (load('viewmodel/BuyerHomeViewModel').BuyerHomeViewModel)();
  await model.loadFeed(); const ref = model.products, revision = model.feedRevision;
  result = [{ ...product }]; await model.loadFeed(true);
  assert.strictEqual(model.products, ref); assert.equal(model.feedRevision, revision);
  fails = true; await model.loadFeed(true);
  assert.strictEqual(model.products, ref); assert(model.feedError);
  model.clear(); await model.loadFeed();
  assert.equal(model.feedState, load('common/Constants').LoadState.ERROR);
  fails = false; await model.loadFeed(); assert.equal(model.feedError, '');
});

test('首屏初始化不重复请求，退出后旧请求不能恢复商品', async () => {
  const response = deferred(); let count = 0;
  const load = harness({ 'service/ProductService': { productService: { getProductFeed: () => { count++; return response.promise; } } } });
  const model = new (load('viewmodel/BuyerHomeViewModel').BuyerHomeViewModel)();
  model.ensureFeedLoaded(); model.ensureFeedLoaded(); assert.equal(count, 1);
  model.clear(); response.resolve([product]); await response.promise; await Promise.resolve();
  assert.equal(model.products.length, 0);
});

test('发布保存通用类别、拒绝旧小类，见面地点只追加到描述', async () => {
  let draft;
  const load = harness({ 'service/ProductService': { productService: { publishProduct: async input => { draft = input; } } } });
  const model = new (load('viewmodel/PublishViewModel').PublishViewModel)();
  assert.equal(model.validate(), false); assert(model.categoryError && model.campusError);
  Object.assign(model, { title: ' 蓝牙耳机 ', description: '九成新', priceText: '20.50', category: '外设',
    campus: '江湾校区', meetingPlace: ' 图书馆门口 ' });
  assert.equal(await model.submit(), true);
  assert.equal(draft.category, '外设'); assert.equal(draft.campus, '江湾校区');
  assert.equal(draft.description, '九成新\n见面地点：图书馆门口'); assert.equal(draft.price, 20.5);
  model.campus = '江湾校区图书馆门口'; assert.equal(model.validate(), false);
  model.campus = '江湾校区';
  for (const category of ['教材', '数码', '外设', '日用', '运动', '其他']) {
    model.category = category; assert.equal(model.validate(), true);
  }
  model.category = '耳机'; assert.equal(model.validate(), false);
});

test('发布失败显示表单错误并保留输入，进行中禁止重复提交，照片限制三张', async () => {
  const response = deferred(); let calls = 0;
  const load = harness({ 'service/ProductService': { productService: { publishProduct: () => { calls++; return response.promise; } } } });
  const model = new (load('viewmodel/PublishViewModel').PublishViewModel)();
  Object.assign(model, { title: '耳机', description: '九成新', priceText: '20', category: '外设', campus: '江湾校区' });
  model.addImages(['a','b','c','d']); assert.equal(model.images.length, 3);
  model.removeImage(1); assert.equal(model.images.join(','), 'a,c');
  const first = model.submit(); assert.equal(await model.submit(), false); assert.equal(calls, 1);
  response.reject(new Error('网络不可用')); assert.equal(await first, false);
  assert.equal(model.formError, '网络不可用'); assert.equal(model.priceError, '');
  assert.equal(model.title, '耳机'); assert.equal(model.submitting, false);
});

test('退出时强制清空 AI，并忽略之前尚未完成的请求', async () => {
  const response = deferred();
  const load = harness({ 'service/AgentService': { agentService: { queryByNaturalLanguage: () => response.promise } } });
  const model = new (load('viewmodel/AgentViewModel').AgentViewModel)();
  model.query = '找耳机'; const request = model.send(); model.resetConversation(true);
  response.resolve({ requestId: 'req1', sessionId: 'old_user', replyText: '找到耳机', recommendations: [], status: 'completed' });
  await request;
  assert.equal(model.turns.length, 0); assert.equal(model.sessionId, null); assert.equal(model.loading, false);
});

test('历史分页与详情不会覆盖当前对话，新对话仍能查看后端历史', async () => {
  const summary = { sessionId: 'session_history', title: '找教材', createdAt: 1, updatedAt: 2, turnCount: 2 };
  let cursor;
  const load = harness({ 'service/AgentService': { agentService: {
    getHistory: async input => { cursor = input; return { items: [summary], nextCursor: input === null ? 'next' : null }; },
    getHistoryTurns: async () => ({ items: [{ question: '找教材', createdAt: 1,
      response: { requestId: 'old_req', sessionId: summary.sessionId, status: 'completed', reply: '已找到教材', recommendations: [] } }], nextCursor: null })
  } } });
  const model = new (load('viewmodel/AgentViewModel').AgentViewModel)();
  const active = [{ id: 'active', question: '找台灯', recommendations: [] }];
  model.turns = active; model.query = '未发送草稿'; model.sessionId = 'session_active';
  await model.openHistory(); assert.equal(model.history.length, 1); assert.equal(cursor, null);
  await model.openHistory(true); assert.equal(model.history.length, 2); assert.equal(cursor, 'next');
  await model.viewHistory(summary);
  assert.equal(model.historyTurns[0].question, '找教材'); assert.equal(model.historyTurns[0].createdAt, 1);
  assert.strictEqual(model.turns, active); assert.equal(model.query, '未发送草稿'); assert.equal(model.sessionId, 'session_active');
  model.closeHistory(); assert.strictEqual(model.turns, active);
  model.resetConversation(); assert.equal(model.turns.length, 0);
  await model.openHistory(); assert.equal(model.history[0].sessionId, summary.sessionId);
});

test('退出和快速切换历史时忽略旧请求，历史加载失败可重试', async () => {
  const pending = deferred(); let fails = true;
  const summary = { sessionId: 'session_1', title: '找教材' };
  const load = harness({ 'service/AgentService': { agentService: {
    getHistory: () => pending.promise,
    getHistoryTurns: async () => { if (fails) throw new Error('offline'); return { items: [], nextCursor: null }; }
  } } });
  const model = new (load('viewmodel/AgentViewModel').AgentViewModel)();
  const request = model.openHistory(); model.resetConversation(true);
  pending.resolve({ items: [summary], nextCursor: null }); await request;
  assert.equal(model.history.length, 0); assert.equal(model.historyVisible, false);
  await model.viewHistory(summary); assert.equal(model.historyError, 'offline');
  fails = false; await model.viewHistory(summary); assert.equal(model.historyError, '');
});

test('个人资料保存失败保留昵称头像，保存成功同步用户，禁止重复提交', async () => {
  const response = deferred(); let calls = 0;
  const load = harness({ 'service/AuthenticationService': { authService: {
    getCurrentUser: () => ({ id: 'user', nickname: '旧昵称', hasPassword: false }),
    refreshUser: async () => ({ id: 'user', nickname: '旧昵称', hasPassword: false }),
    updateProfile: () => { calls++; return response.promise; }
  } } });
  const model = new (load('viewmodel/ProfileViewModel').ProfileViewModel)();
  await model.load(); model.nickname = ' '; assert.equal(await model.saveProfile(), false);
  model.nickname = '新昵称'; model.avatarUri = 'photo://selected';
  const first = model.saveProfile(); assert.equal(await model.saveProfile(), false); assert.equal(calls, 1);
  response.reject(new Error('网络不可用')); assert.equal(await first, false);
  assert.equal(model.nickname, '新昵称'); assert.equal(model.avatarUri, 'photo://selected'); assert.equal(model.profileError, '网络不可用');
});

test('首次密码设置与修改校验不同，成功后清空密码并更新用户', async () => {
  let calls = 0, submitted;
  const user = { id: 'user', nickname: '同学', hasPassword: false };
  const load = harness({ 'service/AuthenticationService': { authService: {
    getCurrentUser: () => user, refreshUser: async () => user,
    changePassword: async (...values) => { calls++; submitted = values; return { ...user, hasPassword: true }; }
  } } });
  const model = new (load('viewmodel/ProfileViewModel').ProfileViewModel)(); await model.load();
  model.newPassword = 'short'; model.confirmPassword = 'short'; assert.equal(await model.savePassword(), false);
  model.newPassword = 'Campus123'; model.confirmPassword = 'different'; assert.equal(await model.savePassword(), false);
  model.confirmPassword = 'Campus123'; assert.equal(await model.savePassword(), false); assert.equal(calls, 0);
  model.smsCode = '123456'; assert.equal(await model.savePassword(), true);
  assert.equal(submitted.join(','), ',Campus123,123456'); assert.equal(model.user.hasPassword, true);
  assert.equal(model.newPassword + model.confirmPassword + model.smsCode, '');
  model.newPassword = 'Changed123'; model.confirmPassword = 'Changed123';
  assert.equal(await model.savePassword(), false); assert.equal(calls, 1);
  model.currentPassword = 'Campus123'; assert.equal(await model.savePassword(), true); assert.equal(calls, 2);
  assert.equal(model.currentPassword, '');
});

test('资料保存成功使用返回头像与昵称，刷新失败后能重试加载', async () => {
  let fails = true, saved;
  const user = { id: 'user', nickname: '旧昵称', avatar: '' };
  const load = harness({ 'service/AuthenticationService': { authService: {
    getCurrentUser: () => user,
    refreshUser: async () => { if (fails) throw new Error('offline'); return user; },
    updateProfile: async (nickname, uri) => { saved = [nickname, uri]; return { ...user, nickname: '新昵称', avatar: 'https://test/avatar' }; }
  } } });
  const model = new (load('viewmodel/ProfileViewModel').ProfileViewModel)();
  await model.load(); assert.equal(model.profileError, 'offline');
  fails = false; await model.load(); assert.equal(model.loading, false);
  model.nickname = '新昵称'; model.avatarUri = 'photo://selected';
  assert.equal(await model.saveProfile(), true); assert.equal(saved.join(','), '新昵称,photo://selected');
  assert.equal(model.user.avatar, 'https://test/avatar'); assert.equal(model.avatarUri, ''); assert.equal(model.profileError, '');
});

test('密码登录与验证码登录切换清空凭据，提交时禁止重复登录', async () => {
  const response = deferred(); let calls = 0;
  const load = harness({ 'service/AuthenticationService': { authService: {
    loginByPassword: () => { calls++; return response.promise; }
  } } });
  const model = new (load('viewmodel/AuthViewModel').AuthViewModel)();
  model.phone = '13800000001'; model.smsCode = '123456'; model.switchMode();
  assert.equal(model.smsCode, ''); assert.equal(model.passwordMode, true);
  assert.equal(await model.login(), false);
  model.password = 'Campus123'; const first = model.login();
  assert.equal(await model.login(), false); assert.equal(calls, 1);
  model.switchMode(); assert.equal(model.passwordMode, true);
  response.resolve({ id: 'user' }); assert.equal(await first, true); assert.equal(model.password, '');
});

test('成色和交易状态文案覆盖接口值', () => {
  const load = harness(); const { formatCondition } = load('common/Utils');
  assert.equal(['new','like_new','good','fair','unknown'].map(formatCondition).join(','), '全新,近乎全新,成色良好,有使用痕迹,未注明');
  assert.equal(['PENDING','ACCEPTED','COMPLETED','REJECTED'].map(load('common/Constants').TradeStatusUI.text).join(','), '待确认,待交易,已完成,已关闭');
});

test('自己的商品和已售出商品不预约，成功后不重复提交', async () => {
  let calls = 0;
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => ({ id: 'buyer' }) } },
    'service/TransactionService': { transactionService: { createTransaction: async () => { calls++; } } }
  });
  const model = new (load('viewmodel/ProductDetailViewModel').ProductDetailViewModel)();
  model.detail = { product: { ...product, sellerId: 'buyer', status: 'ACTIVE' } };
  assert.equal(await model.purchase(), false);
  model.detail.product.sellerId = 'seller'; model.detail.product.status = 'SOLD';
  assert.equal(await model.purchase(), false);
  model.detail.product.status = 'ACTIVE'; assert.equal(await model.purchase(), true);
  assert.equal(await model.purchase(), false); assert.equal(calls, 1);
});
