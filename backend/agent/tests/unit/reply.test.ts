import { describe, expect, it } from "vitest";
import { noResultsReply, normalizeReply } from "../../src/agent/reply.js";

describe("normalizeReply", () => {
  it("shows inherited hard filters and how to reset them when there are no results", () => {
    const reply = noResultsReply({ category: "教材", keyword: "English book", maxPriceCents: 8000, preferredCampus: "江湾校区" });
    expect(reply).toContain("关键词：English book");
    expect(reply).toContain("价格不超过 80 元");
    expect(reply).toContain("取消预算限制");
    expect(reply).toContain("新对话");
    expect(reply).not.toContain("取货校区：江湾校区");
  });
  it("keeps paragraphs while removing markdown emphasis and literal escapes", () => {
    expect(normalizeReply("找到：\\n\\n1. **高数教材**\\n2. __微积分教材__"))
      .toBe("找到：\n\n1. 高数教材\n2. 微积分教材");
  });

  it("does not collapse ordinary numbered text", () => {
    expect(normalizeReply("1. 高数教材\n2. 键盘")).toBe("1. 高数教材\n2. 键盘");
  });
});
