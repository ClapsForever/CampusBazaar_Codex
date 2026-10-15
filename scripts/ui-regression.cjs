// Execute the actual ArkTS ViewModels with service/Kit doubles; no device is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require(process.env.ARK_TYPESCRIPT || require.resolve('typescript', { paths: [path.join(__dirname, '../backend/api')] }));
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
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, { exports, require: dependency => {
      if (overrides[dependency]) return overrides[dependency];
      if (dependency.startsWith('@kit.')) return {};
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency)));
    }, setTimeout, clearTimeout, setInterval, clearInterval, console, ...runtime }, { filename });
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

function tradeDetail(id = 'trade_a') {
  return { transaction: { id, status: 'PENDING' }, product,
    buyer: { id: 'buyer' }, seller: { id: 'seller' } };
}

test('交易列表忽略旧响应，静默失败保留列表，重试清除错误', async () => {
  const old = deferred(), fresh = deferred(); let count = 0, fails = false;
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => ({ id: 'buyer' }) } },
    'service/TransactionService': { transactionService: { getTransactionsForUser: () => {
      if (fails) throw new Error('offline');
      return (++count === 1 ? old : fresh).promise;
    } } }
  });
  const model = new (load('viewmodel/TradeViewModel').TradeViewModel)();
  const a = model.loadList(), b = model.loadList(true);
  fresh.resolve([{ transaction: { id: 'fresh' } }]); await b;
  old.resolve([]); await a;
  assert.equal(model.items[0].transaction.id, 'fresh');
  fails = true; await model.loadList(true);
  assert.equal(model.listState, load('common/Constants').LoadState.CONTENT);
  assert.equal(model.lastError, 'offline');
  fails = false; await model.loadList(true); assert.equal(model.lastError, '');
});

test('交易列表退出页面或切换账号后丢弃在途结果', async () => {
  let current = { id: 'buyer' }, pending = deferred();
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => current } },
    'service/TransactionService': { transactionService: { getTransactionsForUser: () => pending.promise } }
  });
  const model = new (load('viewmodel/TradeViewModel').TradeViewModel)();
  const first = model.loadList(); model.dispose(); pending.resolve([tradeDetail()]); await first;
  assert.equal(model.items.length, 0);
  pending = deferred(); const second = model.loadList(); current = { id: 'other' };
  pending.resolve([tradeDetail()]); await second; assert.equal(model.items.length, 0);
});

test('旧交易发送完成不能清空新交易草稿或修改新请求的发送状态', async () => {
  const old = deferred(), fresh = deferred(); let count = 0;
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => ({ id: 'buyer' }) } },
    'service/TransactionService': { transactionService: { getTransactionDetail: async id => tradeDetail(id) } },
    'service/MessageService': { messageService: { getMessages: async () => [],
      sendMessage: () => (++count === 1 ? old : fresh).promise } }
  }, { setTimeout: () => 0 });
  const model = new (load('viewmodel/TradeViewModel').TradeViewModel)();
  await model.loadDetail('trade_a'); model.chatText = '旧消息'; const first = model.send();
  await model.loadDetail('trade_b'); model.chatText = '新消息'; const second = model.send();
  old.resolve(); assert.equal(await first, false);
  assert.equal(model.chatText, '新消息'); assert.equal(model.sending, true);
  fresh.resolve(); assert.equal(await second, true); assert.equal(model.sending, false);
});

test('发送中编辑的下一条草稿保留，较旧消息请求不能覆盖新消息', async () => {
  const oldMessages = deferred(), send = deferred(), entered = deferred(); let count = 0;
  const freshMessages = [{ id: 'msg_new', content: '新消息' }];
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => ({ id: 'buyer' }) } },
    'service/TransactionService': { transactionService: { getTransactionDetail: async id => tradeDetail(id) } },
    'service/MessageService': { messageService: {
      getMessages: () => {
        if (++count === 1) { entered.resolve(); return oldMessages.promise; }
        return Promise.resolve(freshMessages);
      }, sendMessage: () => send.promise
    } }
  }, { setTimeout: () => 0 });
  const model = new (load('viewmodel/TradeViewModel').TradeViewModel)();
  const loading = model.loadDetail('trade_a'); await entered.promise;
  model.chatText = '发出'; const sending = model.send(); model.chatText = '下一条';
  send.resolve(); assert.equal(await sending, true); assert.equal(model.chatText, '下一条');
  oldMessages.resolve([]); await loading; assert.equal(model.messages[0].id, 'msg_new');
});

test('卖家状态操作返回时不能覆盖已切换的交易', async () => {
  const action = deferred();
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => ({ id: 'seller' }) } },
    'service/TransactionService': { transactionService: { getTransactionDetail: async id => tradeDetail(id),
      acceptTransaction: () => action.promise } },
    'service/MessageService': { messageService: { getMessages: async () => [] } }
  });
  const model = new (load('viewmodel/TradeViewModel').TradeViewModel)();
  await model.loadDetail('trade_a'); const pending = model.accept();
  await model.loadDetail('trade_b'); action.resolve({ id: 'trade_a', status: 'ACCEPTED' });
  assert.equal(await pending, false); assert.equal(model.detail.transaction.id, 'trade_b');
  assert.equal(model.detail.transaction.status, 'PENDING');
});

test('慢轮询不重复发起，旧轮询不会回退刚接受的交易状态', async () => {
  const response = deferred(); let poll, count = 0;
  const load = harness({
    'service/AuthenticationService': { authService: { getCurrentUser: () => ({ id: 'seller' }) } },
    'service/TransactionService': { transactionService: {
      getTransactionDetail: async id => (++count === 1 ? tradeDetail(id) : response.promise),
      acceptTransaction: async id => ({ id, status: 'ACCEPTED' })
    } },
    'service/MessageService': { messageService: { getMessages: async () => [] } }
  }, { setInterval: callback => { poll = callback; return 1; }, clearInterval: () => {} });
  const model = new (load('viewmodel/TradeViewModel').TradeViewModel)();
  await model.loadDetail('trade_a'); model.startPolling('trade_a');
  const pending = poll(); await poll(); assert.equal(count, 2);
  assert.equal(await model.accept(), true);
  response.resolve(tradeDetail()); await pending;
  assert.equal(model.detail.transaction.status, 'ACCEPTED'); model.dispose();
});

test('较早的登录响应不能替换较新的登录，也不能在退出后恢复身份', async () => {
  const first = deferred(), second = deferred(), third = deferred(); let count = 0;
  const tokens = [];
  const load = harness({
    '@kit.NetworkKit': { http: { RequestMethod: { POST: 'POST' } } },
    'service/ImageUpload': {},
    'service/BusinessApiClient': { businessApiClient: {
      request: (_method, path) => path.endsWith('/logout') ? Promise.resolve({ ok: true }) : [first, second, third][count++].promise,
      setToken: value => tokens.push(value), clearToken: () => tokens.push('')
    } }
  });
  const service = new (load('service/AuthenticationService').HttpAuthenticationService)();
  const a = service.loginByPassword('a@example.com', 'Campus123');
  const rejectedA = assert.rejects(a, /登录状态已改变/);
  const b = service.loginByPassword('b@example.com', 'Campus123');
  second.resolve({ user: { id: 'b' }, token: 'b-token' }); await b;
  first.resolve({ user: { id: 'a' }, token: 'a-token' }); await rejectedA;
  assert.equal(service.getCurrentUser().id, 'b'); assert.equal(tokens.join(','), 'b-token');
  const c = service.loginByPassword('c@example.com', 'Campus123');
  const rejectedC = assert.rejects(c, /登录状态已改变/);
  await service.logout(); third.resolve({ user: { id: 'c' }, token: 'c-token' }); await rejectedC;
  assert.equal(service.getCurrentUser(), null);
});

test('较早的退出请求完成或失败均不能清除新账号登录状态', async () => {
  for (const fails of [false, true]) {
    const logout = deferred(); let token = '';
    const load = harness({
      '@kit.NetworkKit': { http: { RequestMethod: { POST: 'POST' } } }, 'service/ImageUpload': {},
      'service/BusinessApiClient': { businessApiClient: {
        request: async (_method, path, body) => path.endsWith('/logout') ? logout.promise :
          { user: { id: JSON.parse(body).email }, token: 'new-token' },
        setToken: value => { token = value; }, clearToken: () => { token = ''; }
      } }
    });
    const service = new (load('service/AuthenticationService').HttpAuthenticationService)();
    await service.loginByPassword('old@example.com', 'Campus123');
    const pending = service.logout();
    const checked = fails ? assert.rejects(pending, /offline/) : pending;
    assert.equal(service.getCurrentUser(), null); assert.equal(token, '');
    await service.loginByPassword('new@example.com', 'Campus123');
    if (fails) logout.reject(new Error('offline')); else logout.resolve({ ok: true });
    await checked; assert.equal(service.getCurrentUser().id, 'new@example.com'); assert.equal(token, 'new-token');
  }
});

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

test('修改密码必须输入当前密码，成功后清空凭据并更新用户', async () => {
  let calls = 0, submitted;
  const user = { id: 'user', email: 'member@example.com', nickname: '同学', hasPassword: true };
  const load = harness({ 'service/AuthenticationService': { authService: {
    getCurrentUser: () => user, refreshUser: async () => user,
    changePassword: async (...values) => { calls++; submitted = values; return user; }
  } } });
  const model = new (load('viewmodel/ProfileViewModel').ProfileViewModel)(); await model.load();
  model.newPassword = 'short'; model.confirmPassword = 'short'; assert.equal(await model.savePassword(), false);
  model.newPassword = 'Demo12'; model.confirmPassword = 'different'; assert.equal(await model.savePassword(), false);
  model.confirmPassword = 'Demo12'; assert.equal(await model.savePassword(), false); assert.equal(calls, 0);
  model.currentPassword = 'Old123'; assert.equal(await model.savePassword(), true);
  assert.equal(submitted.join(','), 'Old123,Demo12'); assert.equal(model.user.hasPassword, true);
  assert.equal(model.currentPassword + model.newPassword + model.confirmPassword, '');
  assert.match(model.message, /邮箱/);
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

test('邮箱登录校验输入并规范化邮箱，提交时禁止重复登录', async () => {
  const response = deferred(); let calls = 0, submitted;
  const load = harness({ 'service/AuthenticationService': { authService: {
    loginByPassword: (...values) => { calls++; submitted = values; return response.promise; }
  } } });
  const model = new (load('viewmodel/AuthViewModel').AuthViewModel)();
  model.email = '13800000001'; model.password = 'Demo12';
  assert.equal(await model.login(), false); assert(model.emailError); assert.equal(calls, 0);
  model.email = ' Member@Example.com '; model.password = '';
  assert.equal(await model.login(), false); assert(model.passwordError);
  model.password = 'Demo12'; const first = model.login();
  assert.equal(await model.login(), false); assert.equal(calls, 1);
  assert.equal(submitted.join(','), 'member@example.com,Demo12');
  response.resolve({ id: 'user' }); assert.equal(await first, true); assert.equal(model.password, '');
});

test('邮箱登录失败保留输入并支持重试', async () => {
  let failed = true;
  const load = harness({ 'service/AuthenticationService': { authService: {
    loginByPassword: async () => { if (failed) throw new Error('邮箱或密码错误'); return { id: 'user' }; }
  } } });
  const model = new (load('viewmodel/AuthViewModel').AuthViewModel)();
  model.email = 'member@example.com'; model.password = 'Demo12';
  assert.equal(await model.login(), false); assert.equal(model.formError, '邮箱或密码错误');
  assert.equal(model.email, 'member@example.com'); assert.equal(model.password, 'Demo12'); assert.equal(model.loggingIn, false);
  failed = false; assert.equal(await model.login(), true); assert.equal(model.formError, '');
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
