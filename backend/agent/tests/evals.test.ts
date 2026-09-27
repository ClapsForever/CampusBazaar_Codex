import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseIntent } from "../src/intent/parser.js";

interface EvalCase {
  id: string;
  input: string;
  expect: string;
  must?: Record<string, unknown>;
}

const cases = JSON.parse(readFileSync(resolve(process.cwd(), "evals/cases.json"), "utf8")) as EvalCase[];

describe("fixed evaluation cases", () => {
  it("contains the required 30-50 fixed scenarios", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(cases.length).toBeLessThanOrEqual(50);
  });

  it.each(cases.map((item) => [item.id, item] as const))("%s", (_id, item) => {
    const result = parseIntent([{ role: "user", content: item.input, timestamp: Date.now() }]);
    if (item.expect === "compare" || item.expect === "detail" || item.expect === "transaction" || item.expect === "preference" || item.expect === "clarification") {
      expect(result.kind === item.expect || (item.expect === "clarification" && result.needsClarification)).toBe(true);
    }
    for (const [key, value] of Object.entries(item.must ?? {})) expect(result.filters[key as keyof typeof result.filters]).toBe(value);
  });
});
