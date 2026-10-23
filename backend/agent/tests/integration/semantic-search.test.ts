import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../../../api/src/server.js";
import type { Config } from "../../../api/src/config.js";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { HttpBusinessClient } from "../../src/clients/http.js";
import { MemorySessionStore } from "../../src/sessions/store.js";
import { emptyPlan, type TurnPlan } from "../../src/agent/policy.js";
import * as model from "../../src/agent/model.js";
import { mockSemanticTopic } from "../helpers/semantic-plans.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map(close => close()));
});

/** Use the real protected HTTP search and an isolated SQLite catalog, not the
 * mock search implementation, so schema/serialization/SQL mismatches are caught. */
async function fixture(maxResults = 10) {
  const apiConfig: Config = {
    mode: "local", host: "127.0.0.1", port: 0, databasePath: ":memory:", uploadDir: tmpdir(),
    publicBaseUrl: "http://127.0.0.1", sessionSecret: "semantic-test-secret-longer-than-thirty-two-characters",
    agentBaseUrl: "http://127.0.0.1:1", agentServiceToken: "semantic-agent-token",
    internalAgentToken: "semantic-backend-token", schoolId: "school_demo",
  };
  const api = createApiApp(apiConfig);
  cleanup.push(async () => { if (api.server.listening) await api.close(); else api.db.close(); });
  await new Promise<void>((resolve, reject) => {
    api.server.once("error", reject);
    api.server.listen(0, "127.0.0.1", resolve);
  });
  const address = api.server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  api.db.prepare("INSERT INTO users(id,email,nickname,avatar,school_id,created_at) VALUES('user_semantic','semantic@example.com','测试同学','','school_demo',1)").run();
  const user = { userId: "user_semantic", schoolId: "school_demo" };
  const client = new HttpBusinessClient({ baseUrl: `http://127.0.0.1:${address.port}`, token: apiConfig.internalAgentToken,
    searchPath: "/internal/listings/search", detailPath: "/internal/listings/{listingId}", preferencesPath: "/internal/users/preferences", timeoutMs: 3000 });
  const search = vi.spyOn(client, "searchListings");
  const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MODEL_MODE: "mock", MOCK_BACKEND: "false",
    SERVICE_AUTH_TOKEN: "semantic-agent-token", MAX_RESULTS: String(maxResults) });
  const sessions = new MemorySessionStore(60_000);
  const requestModelText = model.requestModelText;
  vi.spyOn(model, "requestModelText").mockImplementation((config, system, prompt, signal, mockText) => {
    const input = JSON.parse(prompt);
    const semantic = typeof input.message === "string" ? mockSemanticTopic(input.message) : undefined;
    return requestModelText(config, system, prompt, signal, semantic
      ? JSON.stringify({ ...emptyPlan("search"), changes: semantic }) : mockText);
  });
  const agent = buildApp({ config, client, sessionStore: sessions });
  cleanup.push(() => agent.close());
  let sequence = 0;
  function add(id: string, title: string, price = 2000, category = "教材", campus = "邯郸校区", description = "测试商品") {
    api.db.prepare(`INSERT INTO products(id,seller_id,school_id,title,description,price_cents,category,condition,campus,status,published_at)
      VALUES(?,?,'school_demo',?,?,?,?,'like_new',?,'ACTIVE',?)`)
      .run(`listing_${id}`, user.userId, title, description, price, category, campus, ++sequence);
  }
  add("linear", "线性代数教材");
  add("linear_notes", "线代复习讲义");
  add("math", "高等数学教材");
  add("cet_vocab", "六级词汇书", 1500);
  add("cet_tests", "六级历年真题试卷", 2500);
  add("cet_reading", "CET-6 阅读专项训练", 3500);
  add("cet_listening", "大学英语六级听力", 4500);
  add("cet4", "四级词汇书", 500);
  add("english", "英语语法教材", 500);
  const chat = async (message: string, sessionId: string | null = null) => {
    const response = await agent.inject({ method: "POST", url: "/internal/agent/chat",
      headers: { "x-agent-service-token": config.serviceAuthToken, "x-user-id": user.userId, "x-school-id": user.schoolId },
      payload: { requestId: `semantic_${++sequence}`, sessionId, message } });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  const plan = (changes: TurnPlan["changes"], action: "search" | "refine" = "search", needs?: string[]) =>
    vi.spyOn(model, "requestModelText").mockResolvedValueOnce(JSON.stringify({ ...emptyPlan(action), changes, ...(needs ? { needs } : {}) }));
  return { api, agent, add, chat, plan, search, sessions, user };
}
const ids = (response: any): string[] => response.recommendations.map((item: any) => item.listingId);

describe("semantic retrieval through the business HTTP API", () => {
  it("finds the published full-name textbook from an abbreviation without mixing in other maths", async () => {
    const f = await fixture();
    const result = await f.chat("帮我找一本线代教材");
    expect(ids(result).sort()).toEqual(["listing_linear", "listing_linear_notes"]);
    expect(result.reply).toContain("我理解你可能需要");
    expect(f.search).toHaveBeenCalledTimes(1);
    expect(f.search.mock.calls[0]?.[0].queryTerms).toContain("线性代数");
  });
  it("expands an exam goal across vocabulary, papers, listening and reading, excluding other exams", async () => {
    const f = await fixture();
    const result = await f.chat("我想考六级");
    expect(result.status).toBe("completed");
    expect(ids(result).sort()).toEqual(["listing_cet_listening", "listing_cet_reading", "listing_cet_tests", "listing_cet_vocab"]);
    const narrowed = await f.chat("只找六级词汇书", result.sessionId);
    expect(ids(narrowed)).toEqual(["listing_cet_vocab"]);
  });
  it("retains expansion for budget/page follow-ups, paginates the union, and resolves latest positions", async () => {
    const f = await fixture(2);
    const first = await f.chat("我想考六级，50元以内，按价格从低到高排");
    expect(ids(first)).toEqual(["listing_cet_vocab", "listing_cet_tests"]);
    const second = await f.chat("下一页", first.sessionId);
    expect(ids(second)).toEqual(["listing_cet_reading", "listing_cet_listening"]);
    const detail = await f.chat("第一个详情", first.sessionId);
    expect(ids(detail)).toEqual(["listing_cet_reading"]);
    const cheaper = await f.chat("预算改成30元", first.sessionId);
    expect(ids(cheaper)).toEqual(["listing_cet_vocab", "listing_cet_tests"]);
    expect(f.search.mock.calls.at(-1)?.[0]).toMatchObject({ maxPriceCents: 3000, page: 1, queryTerms: ["六级", "CET6", "CET-6", "CET 6"] });
    const switched = await f.chat("改找高数教材", first.sessionId);
    expect(ids(switched)).toEqual(["listing_math"]);
    expect(f.sessions.get(first.sessionId, f.user).filters.queryTerms).toBeUndefined();
  });
  it("uses open-ended model vocabulary beyond the deterministic example list", async () => {
    const f = await fixture();
    f.add("storage", "塑料整理箱", 2000, "日用");
    f.add("cart", "折叠手拉车", 3000, "其他");
    f.plan({ keyword: "搬宿舍", queryTerms: ["整理箱", "打包袋", "手拉车"] });
    const result = await f.chat("下周要搬宿舍，有什么能用得上的？");
    expect(ids(result).sort()).toEqual(["listing_cart", "listing_storage"]);
    expect(f.search.mock.calls[0]?.[0]).not.toHaveProperty("category");
  });
  it("accepts model normalization, while enforcing explicit budget, campus and exclusions for every alternative", async () => {
    const f = await fixture();
    f.add("linear_expensive", "linear algebra", 9000);
    f.add("linear_other_campus", "线性代数教材", 1000, "教材", "江湾校区");
    f.plan({ keyword: "线性代数", category: "教材", queryTerms: ["线代", "线性代数", "linear algebra"], maxPriceCents: 999999, campus: "江湾校区", excludeKeywords: ["讲义"] });
    const result = await f.chat("找50元以内的线代教材，只要邯郸校区，不要讲义");
    expect(ids(result)).toEqual(["listing_linear"]);
    expect(f.search.mock.calls[0]?.[0]).toMatchObject({ maxPriceCents: 5000, campus: "邯郸校区", excludeKeywords: ["讲义"] });
  });
  it("clears old expansion and category on a cross-category goal, but cannot replace it in a budget-only refine", async () => {
    const f = await fixture();
    const first = await f.chat("找线代教材，50元以内");
    f.add("storage", "搬家打包袋", 2000, "日用");
    f.plan({ keyword: "搬宿舍", category: null, queryTerms: ["打包袋", "手拉车"] });
    const moved = await f.chat("我要搬宿舍", first.sessionId);
    expect(ids(moved)).toEqual(["listing_storage"]);
    f.plan({ keyword: "自行车", queryTerms: ["自行车"], maxPriceCents: 1000 }, "refine");
    const refined = await f.chat("预算改成10元", first.sessionId);
    expect(refined.status).toBe("no_results");
    expect(refined.reply).toContain("搬宿舍");
    expect(f.sessions.get(first.sessionId, f.user).filters).toEqual({ keyword: "搬宿舍", queryTerms: ["打包袋", "手拉车"], maxPriceCents: 1000 });
  });
  it("can broaden to a composite goal even when one mentioned product has a known category", async () => {
    const f = await fixture();
    const first = await f.chat("找线代教材");
    f.add("headphones", "听力耳机", 5000, "外设");
    f.plan({ keyword: "六级备考", category: null, queryTerms: ["六级", "CET-6", "听力 耳机"] });
    const expanded = await f.chat("我想考六级，也需要听力耳机", first.sessionId);
    expect(ids(expanded).sort()).toEqual(["listing_cet_listening", "listing_cet_reading", "listing_cet_tests", "listing_cet_vocab", "listing_headphones"]);
    expect(f.sessions.get(first.sessionId, f.user).filters.category).toBeUndefined();
  });

  it.each([
    { message: "室友睡了我还想看纸质书", keyword: "夜间阅读", needs: ["局部阅读照明"], category: "日用",
      queryTerms: ["阅读灯", "夹灯"], products: [["clip_lamp", "床头夹灯", "日用"], ["reading_lamp", "便携阅读灯", "日用"]] },
    { message: "桌上各种充电线缠成一团", keyword: "桌面线材整理", needs: ["线材固定", "线材收纳"], category: "日用",
      queryTerms: ["理线器", "绕线器", "线材 收纳"], products: [["cable_clips", "硅胶理线器", "日用"], ["cable_box", "线材收纳盒", "日用"]] },
    { message: "手机总没电，图书馆插座又远", keyword: "外出充电", needs: ["便携充电", "延长充电距离"], category: "外设",
      queryTerms: ["充电宝", "移动电源", "加长 充电线"], products: [["power_bank", "移动电源", "外设"], ["long_cable", "加长充电线", "外设"]] },
    { message: "天气一冷去教室路上手就冻僵了", keyword: "出行保暖", needs: ["手部保暖"], category: "日用",
      queryTerms: ["保暖 手套", "暖手宝"], products: [["gloves", "冬季保暖手套", "日用"], ["hand_warmer", "充电暖手宝", "日用"]] },
    { message: "我想学写代码，手头还没有入门资料", keyword: "编程入门资料", needs: ["编程入门教材"], category: "教材",
      queryTerms: ["Python 入门", "程序设计 教材", "编程 入门"], products: [["python", "Python 入门教程", "教材"], ["programming", "程序设计教材", "教材"]] },
  ])("accepts inferred directions without requiring the product name in '$message'", async ({ message, keyword, needs, category, queryTerms, products }) => {
    const f = await fixture();
    for (const [id, title, group] of products) f.add(id!, title!, 2000, group!);
    f.add("unrelated", "普通桌面装饰摆件", 1000, category);
    f.plan({ keyword, category, queryTerms }, "search", needs);
    const result = await f.chat(message);
    expect(ids(result).sort()).toEqual(products.map(([id]) => `listing_${id}`).sort());
    expect(result.reply).toContain(`我理解你可能需要：${needs.join("、")}`);
    expect(f.sessions.get(result.sessionId, f.user).needs).toEqual(needs);
  });

  it("understands a fuzzy follow-up through the prior goal and preserves the unchanged budget", async () => {
    const f = await fixture();
    f.add("dumbbell", "铸铁哑铃", 4000, "运动");
    f.add("band", "便携弹力带", 1500, "运动");
    f.add("mat", "折叠瑜伽垫", 3000, "运动");
    f.plan({ keyword: "宿舍锻炼", category: "运动", queryTerms: ["哑铃", "弹力带", "瑜伽垫"], maxPriceCents: 5000 }, "search", ["力量练习器材", "室内运动垫"]);
    const first = await f.chat("想在宿舍锻炼，预算50元");
    const mock = f.plan({ keyword: "便携健身器材", category: "运动", queryTerms: ["弹力带", "折叠 瑜伽垫"] }, "refine", ["便于收纳的锻炼用品"]);
    const refined = await f.chat("有没有不用的时候能塞抽屉里的？", first.sessionId);
    expect(ids(refined).sort()).toEqual(["listing_band", "listing_mat"]);
    expect(f.search.mock.calls.at(-1)?.[0]).toMatchObject({ maxPriceCents: 5000, queryTerms: ["弹力带", "折叠 瑜伽垫"] });
    const plannerInput = JSON.parse(mock.mock.calls.at(-2)![2]);
    expect(plannerInput.previousNeeds).toEqual(["力量练习器材", "室内运动垫"]);
    await f.chat("预算改成20元", first.sessionId);
    expect(f.sessions.get(first.sessionId, f.user).needs).toEqual(["便于收纳的锻炼用品"]);
  });

  it("does not commit inferred directions on a failed query or retain them after changing topics", async () => {
    const f = await fixture();
    f.plan({ keyword: "夜间阅读", category: "日用", queryTerms: ["夹灯"] }, "search", ["阅读照明"]);
    const first = await f.chat("晚上读书太暗");
    const savedNeeds = f.sessions.get(first.sessionId, f.user).needs;
    f.plan({ keyword: "搬家", category: null, queryTerms: ["打包袋"] }, "search", ["搬家收纳"]);
    f.search.mockRejectedValueOnce(new Error("test backend unavailable"));
    const failed = await f.agent.inject({ method: "POST", url: "/internal/agent/chat",
      headers: { "x-agent-service-token": "semantic-agent-token", "x-user-id": f.user.userId, "x-school-id": f.user.schoolId },
      payload: { requestId: "semantic_failure", sessionId: first.sessionId, message: "要搬家了" } });
    expect(failed.statusCode).toBe(500);
    expect(f.sessions.get(first.sessionId, f.user).needs).toEqual(savedNeeds);
    await f.chat("改找高数教材", first.sessionId);
    expect(f.sessions.get(first.sessionId, f.user).needs).toEqual(["高数"]);
  });
});
