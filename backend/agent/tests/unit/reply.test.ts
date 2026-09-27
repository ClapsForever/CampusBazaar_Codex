import { describe, expect, it } from "vitest";
import { normalizeReply } from "../../src/agent/reply.js";

describe("normalizeReply", () => {
  it("keeps paragraphs while removing markdown emphasis and literal escapes", () => {
    expect(normalizeReply("找到：\\n\\n1. **高数教材**\\n2. __微积分教材__"))
      .toBe("找到：\n\n1. 高数教材\n2. 微积分教材");
  });

  it("does not collapse ordinary numbered text", () => {
    expect(normalizeReply("1. 高数教材\n2. 键盘")).toBe("1. 高数教材\n2. 键盘");
  });
});
