import { describe, expect, it } from "vitest";
import { parseIntent } from "../../src/intent/parser.js";

function messages(...contents: string[]) {
  return contents.map((content, index) => ({ role: "user" as const, content, timestamp: index + 1 }));
}

describe("intent parser", () => {
  it("extracts hard budget and category", () => {
    const result = parseIntent(messages("50 元以内的高数教材"));
    expect(result.filters).toMatchObject({ category: "教材", keyword: "高数", maxPriceCents: 5000 });
  });

  it("inherits conditions and supports budget replacement", () => {
    const result = parseIntent(messages("高数教材，预算 50 元", "九成新", "预算改成 80"));
    expect(result.filters).toMatchObject({ category: "教材", keyword: "高数", maxPriceCents: 8000, condition: "like_new" });
  });

  it("keeps preferred campus separate from hard campus", () => {
    expect(parseIntent(messages("键盘，最好江湾校区能拿")).filters).toMatchObject({ preferredCampus: "江湾校区" });
    expect(parseIntent(messages("键盘，只要江湾校区")).filters).toMatchObject({ campus: "江湾校区" });
  });

  it("resets topic-specific conditions when the topic changes", () => {
    const result = parseIntent(messages("同济第七版高数教材，50 元以内", "换成键盘"));
    expect(result.filters).toMatchObject({ category: "键盘" });
    expect(result.filters).not.toHaveProperty("version");
    expect(result.filters).not.toHaveProperty("maxPriceCents");
  });

  it("recognizes transaction refusal and positional comparison", () => {
    expect(parseIntent(messages("帮我直接买下来")).kind).toBe("transaction");
    expect(parseIntent(messages("比较第二个和第三个")).referencedPositions).toEqual([2, 3]);
  });
});
