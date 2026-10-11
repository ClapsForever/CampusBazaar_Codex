import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { MOCK_LISTINGS, MockBusinessClient } from "../../src/clients/mock.js";
import { MemorySessionStore } from "../../src/sessions/store.js";
import { AppError } from "../../src/errors/index.js";
import { emptyPlan } from "../../src/agent/policy.js";
import * as model from "../../src/agent/model.js";

const config = loadConfig({ NODE_ENV: "test", SERVICE_AUTH_TOKEN: "test-token", MODEL_MODE: "mock", MOCK_BACKEND: "true", LOG_LEVEL: "silent" });
const user = { userId: "user_001", schoolId: "school_demo" };
const headers = { "x-agent-service-token": "test-token", "x-user-id": user.userId, "x-school-id": user.schoolId };
const apps: ReturnType<typeof buildApp>[] = [];
const initialListingCount = MOCK_LISTINGS.length;
afterEach(async () => { vi.restoreAllMocks(); MOCK_LISTINGS.splice(initialListingCount); await Promise.all(apps.splice(0).map((app) => app.close())); });

function fixture(overrides = {}) {
  const client = new MockBusinessClient();
  const search = vi.spyOn(client, "searchListings");
  const detail = vi.spyOn(client, "getListingDetail");
  const preference = vi.spyOn(client, "getUserPreferences");
  const store = new MemorySessionStore(86400000);
  const app = buildApp({ config: { ...config, ...overrides }, client, sessionStore: store });
  apps.push(app);
  let seq = 0;
  const chat = async (message: string, sessionId: string | null = null) => {
    const response = await app.inject({ method: "POST", url: "/internal/agent/chat", headers, payload: { requestId: `policy_${++seq}`, sessionId, message } });
    return { statusCode: response.statusCode, body: response.json() };
  };
  return { client, search, detail, preference, store, chat };
}

describe("controlled shopping workflow", () => {
  it("finds newly published broad-category objects without returning unrelated peripherals", async () => {
    const sample = { priceCents: 2000, category: "外设", condition: "like_new" as const, campus: "邯郸校区",
      description: "测试商品", status: "active" as const, schoolId: user.schoolId,
      sellerLabel: "测试同学", publishedAt: "2026-10-11T00:00:00.000Z" };
    MOCK_LISTINGS.push({ ...sample, listingId: "listing_new_keyboard", title: "mechanical keyboard" },
      { ...sample, listingId: "listing_new_headphone", title: "蓝牙耳机" });
    const f = fixture();
    const result = await f.chat("帮我找键盘，50元以内");
    expect(result.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_new_keyboard"]);
    expect(f.search.mock.calls.at(-1)?.[0]).toMatchObject({ category: "键盘", maxPriceCents: 5000 });
  });
  it("finds an English-titled book in Chinese and explains why an inherited budget excludes it", async () => {
    MOCK_LISTINGS.push({ listingId: "listing_english_test", title: "english book", category: "教材", priceCents: 10_000_000,
      condition: "like_new", campus: "邯郸校区", description: "Language reference", status: "active", schoolId: user.schoolId,
      sellerLabel: "测试同学", publishedAt: "2026-10-11T00:00:00.000Z" });
    const f = fixture();
    const first = await f.chat("帮我找80元以内的高等数学教材");
    const english = await f.chat("please help me find a english book", first.body.sessionId);
    expect(english.body.status).toBe("no_results");
    expect(english.body.reply).toContain("价格不超过 80 元");
    expect(f.search.mock.calls.at(-1)?.[0]).toMatchObject({ category: "教材", keyword: "english", maxPriceCents: 8000 });
    const chinese = await f.chat("帮我找个英语书", first.body.sessionId);
    expect(chinese.body.status).toBe("no_results");
    expect(f.search.mock.calls.at(-1)?.[0]).toMatchObject({ category: "教材", keyword: "英语", maxPriceCents: 8000 });
    const unbounded = await f.chat("取消预算限制", first.body.sessionId);
    expect(unbounded.body.status).toBe("completed");
    expect(unbounded.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_english_test"]);
    const fresh = await f.chat("帮我找个英语书");
    expect(fresh.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_english_test"]);
    expect(f.store.get(fresh.body.sessionId, user).filters).not.toHaveProperty("maxPriceCents");
  });
  it("returns no historic recommendations on refusal, help, or clarification and leaves search state intact", async () => {
    const f = fixture();
    const first = await f.chat("找键盘，300元以内");
    const id = first.body.sessionId;
    expect(first.body.recommendations).toHaveLength(2);
    for (const message of ["帮我下单", "讲个笑话", "你能做什么", "这几个哪个好"]) {
      const next = await f.chat(message, id);
      expect(next.statusCode).toBe(200);
      expect(next.body.recommendations).toEqual([]);
    }
    expect(f.search).toHaveBeenCalledTimes(1);
    expect(f.detail).not.toHaveBeenCalled();
    expect(f.preference).not.toHaveBeenCalled();
    expect(f.store.get(id, user).filters).toEqual({ category: "键盘", maxPriceCents: 30000 });
    const resumed = await f.chat("预算改成100", id);
    expect(resumed.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_keyboard_002"]);
  });
  it("resolves positions against the latest display rather than accumulated history", async () => {
    const f = fixture();
    const first = await f.chat("找键盘");
    await f.chat("预算改成100", first.body.sessionId);
    const detail = await f.chat("第一个详情", first.body.sessionId);
    expect(detail.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_keyboard_002"]);
    expect(f.detail).toHaveBeenLastCalledWith("listing_keyboard_002", user, expect.any(AbortSignal));
    const missing = await f.chat("第二个详情", first.body.sessionId);
    expect(missing.body.status).toBe("clarification");
    expect(missing.body.recommendations).toEqual([]);
    expect(f.detail).toHaveBeenCalledTimes(1);
  });
  it("compares exactly the requested current products and updates subsequent display order", async () => {
    const f = fixture();
    const first = await f.chat("找高数教材");
    const comparison = await f.chat("比较第二个和第三个", first.body.sessionId);
    expect(comparison.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_math_002", "listing_math_003"]);
    const detail = await f.chat("第一个怎么样", first.body.sessionId);
    expect(detail.body.recommendations.map((item: any) => item.listingId)).toEqual(["listing_math_002"]);
    expect(f.search).toHaveBeenCalledTimes(1);
  });
  it("rechecks availability instead of replaying a previously shown detail", async () => {
    const f = fixture();
    const first = await f.chat("找键盘");
    f.detail.mockRejectedValueOnce(new AppError("LISTING_NOT_FOUND", "商品已下架"));
    const next = await f.chat("第二个详情", first.body.sessionId);
    expect(next.statusCode).toBe(404);
    expect(next.body.code).toBe("LISTING_NOT_FOUND");
    expect(next.body.recommendations).toBeUndefined();
  });
  it("keeps strict no-result filters until the user explicitly changes them", async () => {
    const f = fixture();
    const first = await f.chat("10元以内的键盘");
    expect(first.body.status).toBe("no_results");
    await f.chat("最好江湾校区", first.body.sessionId);
    expect(f.search.mock.calls[1]?.[0]).toMatchObject({ maxPriceCents: 1000, category: "键盘", preferredCampus: "江湾校区" });
    expect(f.store.get(first.body.sessionId, user).displayedListingIds).toEqual([]);
    const detail = await f.chat("第一个详情", first.body.sessionId);
    expect(detail.body.status).toBe("clarification");
    expect(f.detail).not.toHaveBeenCalled();
  });
  it("supports condition cancellation and explicit topic switching", async () => {
    const f = fixture();
    const first = await f.chat("同济第七版高数教材，80元以内，九成新");
    await f.chat("不限制成色了", first.body.sessionId);
    expect(f.store.get(first.body.sessionId, user).filters).toMatchObject({ category: "教材", keyword: "高数", maxPriceCents: 8000, version: "同济第七版" });
    expect(f.store.get(first.body.sessionId, user).filters.condition).toBeUndefined();
    await f.chat("换成耳机", first.body.sessionId);
    expect(f.store.get(first.body.sessionId, user).filters).toEqual({ category: "耳机" });
  });
  it("does not turn an invalid model plan into a query or state change", async () => {
    const f = fixture();
    const first = await f.chat("找键盘");
    vi.spyOn(model, "requestModelText").mockResolvedValueOnce('{"action":"search","changes":{"schoolId":"other"},"positions":[],"page":1}');
    const next = await f.chat("预算改成80", first.body.sessionId);
    expect(next.body.status).toBe("clarification");
    expect(next.body.recommendations).toEqual([]);
    expect(f.search).toHaveBeenCalledTimes(1);
    expect(f.store.get(first.body.sessionId, user).filters).toEqual({ category: "键盘" });
  });
  it("ignores a model's unrequested budget relaxation and does not send catalog data to the planner", async () => {
    const f = fixture();
    const first = await f.chat("50元以内的高数教材");
    const modelCall = vi.spyOn(model, "requestModelText")
      .mockResolvedValueOnce(JSON.stringify({ ...emptyPlan("refine"), changes: { maxPriceCents: 8000, preferredCampus: "江湾校区" } }))
      .mockResolvedValueOnce("已按你的条件查找。");
    const next = await f.chat("江湾校区优先", first.body.sessionId);
    expect(next.statusCode).toBe(200);
    expect(f.search.mock.calls[1]?.[0]).toMatchObject({ category: "教材", keyword: "高数", maxPriceCents: 5000, preferredCampus: "江湾校区" });
    const plannerInput = JSON.parse(modelCall.mock.calls[0]![2]);
    expect(plannerInput).toHaveProperty("previousFilters");
    expect(plannerInput).not.toHaveProperty("results");
    expect(plannerInput).not.toHaveProperty("messages");
  });
  it("rejects an over-limit comparison before executing any partial reads", async () => {
    const f = fixture({ maxToolCalls: 1 });
    const first = await f.chat("找键盘");
    const next = await f.chat("比较第一个和第二个", first.body.sessionId);
    expect(next.body.status).toBe("clarification");
    expect(f.detail).not.toHaveBeenCalled();
  });
  it("rolls back a proposed filter update on backend failure", async () => {
    const f = fixture();
    const first = await f.chat("找键盘，300元以内");
    f.search.mockRejectedValueOnce(new AppError("BACKEND_UNAVAILABLE", "暂不可用"));
    const next = await f.chat("预算改成100", first.body.sessionId);
    expect(next.statusCode).toBe(503);
    expect(f.store.get(first.body.sessionId, user).filters.maxPriceCents).toBe(30000);
    expect(f.store.get(first.body.sessionId, user).displayedListingIds).toHaveLength(2);
  });
  it("queries preferences without returning old product cards", async () => {
    const f = fixture();
    const first = await f.chat("找键盘");
    const next = await f.chat("看看我的偏好", first.body.sessionId);
    expect(next.body.recommendations).toEqual([]);
    expect(f.preference).toHaveBeenCalledTimes(1);
    expect(f.search).toHaveBeenCalledTimes(1);
  });
  it("starts a new topic for an explicitly requested product outside known mock categories", async () => {
    const f = fixture();
    const first = await f.chat("找键盘，300元以内");
    await f.chat("找一台打印机", first.body.sessionId);
    expect(f.search.mock.calls[1]?.[0]).toEqual({ keyword: "打印机", page: 1, pageSize: 10 });
    expect(f.store.get(first.body.sessionId, user).filters).toEqual({ keyword: "打印机" });
  });
  it("retains an incomplete textbook budget until the user supplies the subject", async () => {
    const f = fixture();
    const first = await f.chat("找教材，50元以内");
    expect(first.body.status).toBe("clarification");
    expect(f.search).not.toHaveBeenCalled();
    const next = await f.chat("高数", first.body.sessionId);
    expect(next.body.status).toBe("completed");
    expect(f.search.mock.calls[0]?.[0]).toMatchObject({ category: "教材", keyword: "高数", maxPriceCents: 5000 });
  });
  it("does not pass backend or model failures off as empty inventory", async () => {
    const f = fixture();
    const first = await f.chat("找键盘");
    const saved = f.store.get(first.body.sessionId, user).filters;
    vi.spyOn(model, "requestModelText").mockResolvedValueOnce(JSON.stringify({ ...emptyPlan("refine"), changes: { maxPriceCents: 10000 } }))
      .mockRejectedValueOnce(new AppError("MODEL_UNAVAILABLE", "模型失败"));
    const next = await f.chat("预算改成100", first.body.sessionId);
    expect(next.statusCode).toBe(503);
    expect(next.body.code).toBe("MODEL_UNAVAILABLE");
    expect(f.store.get(first.body.sessionId, user).filters).toEqual(saved);
  });
});
