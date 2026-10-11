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

test('具体类别、历史大类与别名映射，未知类别不从标题推断', () => {
  const { homeCategory, PRODUCT_CATEGORIES, CAMPUS_OPTIONS } = harness()('common/MarketOptions');
  for (const [value, expected] of [['耳机','数码'], ['键盘','数码'], ['显示器','数码'], ['计算器','数码'],
    ['自行车','出行'], ['单车','出行'], ['生活用品','生活'], ['教材','教材'], ['数码','数码'],
    ['生活','生活'], ['出行','出行'], ['未知','全部'], ['', '全部'], [undefined,'全部']]) {
    assert.equal(homeCategory(value), expected);
  }
  assert(!PRODUCT_CATEGORIES.some(option => ['数码','出行','生活'].includes(option.value)));
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

test('发布验证规范选项、保留具体类别、见面地点只追加到描述', async () => {
  let draft;
  const load = harness({ 'service/ProductService': { productService: { publishProduct: async input => { draft = input; } } } });
  const model = new (load('viewmodel/PublishViewModel').PublishViewModel)();
  assert.equal(model.validate(), false); assert(model.categoryError && model.campusError);
  Object.assign(model, { title: ' 蓝牙耳机 ', description: '九成新', priceText: '20.50', category: '耳机',
    campus: '江湾校区', meetingPlace: ' 图书馆门口 ' });
  assert.equal(await model.submit(), true);
  assert.equal(draft.category, '耳机'); assert.equal(draft.campus, '江湾校区');
  assert.equal(draft.description, '九成新\n见面地点：图书馆门口'); assert.equal(draft.price, 20.5);
  model.campus = '江湾校区图书馆门口'; assert.equal(model.validate(), false);
  model.campus = '江湾校区'; model.category = '数码'; assert.equal(model.validate(), false);
});

test('发布失败显示表单错误并保留输入，进行中禁止重复提交，照片限制三张', async () => {
  const response = deferred(); let calls = 0;
  const load = harness({ 'service/ProductService': { productService: { publishProduct: () => { calls++; return response.promise; } } } });
  const model = new (load('viewmodel/PublishViewModel').PublishViewModel)();
  Object.assign(model, { title: '耳机', description: '九成新', priceText: '20', category: '耳机', campus: '江湾校区' });
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

test('成色和交易状态文案覆盖接口值', () => {
  const load = harness(); const { formatCondition } = load('common/Utils');
  assert.equal(['new','like_new','good','fair','unknown'].map(formatCondition).join(','), '全新,近乎全新,成色良好,有使用痕迹,未注明');
  assert.equal(['PENDING','ACCEPTED','COMPLETED','REJECTED'].map(load('common/Constants').TradeStatusUI.text).join(','), '待确认,待见面,已完成,已关闭');
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
