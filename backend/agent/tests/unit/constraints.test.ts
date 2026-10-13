import { describe, expect, it } from "vitest";
import { cancellation, priceDelta, requestedPage } from "../../src/intent/constraints.js";
import { emptyPlan, mergeSearchFilters } from "../../src/agent/policy.js";

describe("grounded money and constraint changes", () => {
  it.each(["想收个键盘，别超过五十块", "键盘有吗？我就五十块预算", "键盘不要超过50块钱", "Find a keyboard under 50 yuan"])("enforces the same budget for %s", message => {
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { category: "外设", keyword: "键盘", maxPriceCents: 9000 } }, message).maxPriceCents).toBe(5000);
  });
  it("does not let a negated old product reset an explicitly retained budget", () => {
    const previous = { category: "外设", keyword: "键盘", maxPriceCents: 5000 };
    const plan = { ...emptyPlan("refine"), changes: { category: "外设", keyword: "耳机", maxPriceCents: 5000 } };
    expect(mergeSearchFilters(previous, plan, "不买键盘了，改找耳机，预算仍然50元")).toEqual({ category: "外设", keyword: "耳机", maxPriceCents: 5000 });
  });
  it("computes a relative edit from the explicit old ceiling, without inventing one", () => {
    expect(priceDelta("再便宜二十块", { maxPriceCents: 10000 })).toEqual({ maxPriceCents: 8000 });
    expect(priceDelta("再便宜20元", {})).toEqual({});
    expect(priceDelta("再下调20块预算", { maxPriceCents: 10000 })).toEqual({ maxPriceCents: 8000 });
    expect(priceDelta("上限50元，最低30元", {})).toEqual({ maxPriceCents: 5000, minPriceCents: 3000 });
    expect(priceDelta("预算80到50元", {})).toEqual({ minPriceCents: 8000, maxPriceCents: 5000 });
  });
  it.each(["不看价格了", "多少钱都行", "把价格上限去掉"])("removes an explicit budget on %s", message => {
    const previous = { keyword: "键盘", maxPriceCents: 5000 };
    expect(mergeSearchFilters(previous, { ...emptyPlan("refine"), changes: { maxPriceCents: null } }, message)).toEqual({ keyword: "键盘" });
  });
  it("does not treat a negated removal or an unrelated campus change as budget permission", () => {
    expect(cancellation("不要取消预算限制", "price")).toBe(false);
    const previous = { keyword: "键盘", maxPriceCents: 5000 };
    expect(mergeSearchFilters(previous, { ...emptyPlan("refine"), changes: { maxPriceCents: null } }, "不要取消预算限制")).toEqual(previous);
    expect(mergeSearchFilters(previous, { ...emptyPlan("refine"), changes: { maxPriceCents: 9000 } }, "江湾优先").maxPriceCents).toBe(5000);
  });
  it("replaces a campus requirement with a preference without losing the budget", () => {
    const plan = { ...emptyPlan("refine"), changes: { campus: null, preferredCampus: "江湾校区" } };
    expect(mergeSearchFilters({ keyword: "键盘", campus: "江湾校区", maxPriceCents: 8000 }, plan, "江湾优先，其他校区也可以"))
      .toEqual({ keyword: "键盘", preferredCampus: "江湾校区", maxPriceCents: 8000 });
  });
  it("splits an explicit version and subject even when the model bundles them", () => {
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "同济第七版高数教材", category: "教材" } }, "帮我找同济第七版高数教材，40元以内"))
      .toEqual({ keyword: "高数", category: "教材", version: "同济第七版", maxPriceCents: 4000 });
  });
  it("normalizes grounded campus aliases before querying exact backend labels", () => {
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", campus: "江湾" } }, "找键盘，只要江湾校区").campus).toBe("江湾校区");
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", preferredCampus: "江湾" } }, "找键盘，江湾优先").preferredCampus).toBe("江湾校区");
  });
  it("separates campus preferences from requirements even when a plan misclassifies them", () => {
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", campus: "江湾" } }, "找键盘，最好在江湾校区"))
      .toEqual({ keyword: "键盘", preferredCampus: "江湾校区" });
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", preferredCampus: "江湾" } }, "找键盘，最好全新，只要江湾校区"))
      .toEqual({ keyword: "键盘", condition: "new", campus: "江湾校区" });
  });
  it("enforces the literal minimum condition rather than a model's approximate grade", () => {
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", condition: "good" } }, "七成新以上键盘").condition).toBe("fair");
  });
  it("grounds exclusions in user intent rather than an unsolicited model field", () => {
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", excludeKeywords: ["机械"] } }, "找键盘，不要机械的").excludeKeywords).toEqual(["机械"]);
    expect(mergeSearchFilters({}, { ...emptyPlan("search"), changes: { keyword: "键盘", excludeKeywords: ["机械"] } }, "找机械键盘").excludeKeywords).toBeUndefined();
  });
  it("understands Chinese page ordinals and common continuation questions", () => {
    expect(requestedPage("第二页", 1)).toBe(2);
    expect(requestedPage("继续", 2)).toBe(3);
    expect(requestedPage("还有其他的吗？", 1)).toBe(2);
  });
});
