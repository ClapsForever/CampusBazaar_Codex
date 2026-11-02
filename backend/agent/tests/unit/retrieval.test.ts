import { describe, expect, it } from "vitest";
import { repairedQueryTerms } from "../../src/agent/retrieval.js";

describe("retrieval repair boundary", () => {
  it("retains failed expressions alongside new alternatives and normalizes whitespace", () => {
    expect(repairedQueryTerms('```json\n{"scope":"specific","topicTerms":["六级"],"queryTerms":[" 六级  真题 ","CET-6 test"]}\n```', ["英语六级真题"]))
      .toEqual(["六级 真题", "CET-6 test", "英语六级真题"]);
  });
  it("does not rerun the same query set", () => {
    expect(repairedQueryTerms('{"scope":"specific","topicTerms":["六级"],"queryTerms":[" 六级   真题 "]}', ["六级 真题"])).toBeUndefined();
  });
  it.each([
    undefined, "not JSON",
    '{"scope":"specific","topicTerms":["六级"],"queryTerms":[]}',
    '{"scope":"specific","topicTerms":["六级"],"queryTerms":["   "]}',
    '{"scope":"specific","topicTerms":["六级"],"queryTerms":["六级 词汇"],"maxPriceCents":null}',
    '{"scope":"specific","topicTerms":["六级"],"queryTerms":["六级 词汇"],"schoolId":"other"}',
  ])("rejects invalid repairs or attempts to change locked filters: %s", text => {
    expect(repairedQueryTerms(text, ["英语六级"])).toBeUndefined();
  });
  it("keeps the repaired union within the business API query limit", () => {
    const terms = repairedQueryTerms(JSON.stringify({ scope: "specific", topicTerms: ["新词"], queryTerms: Array.from({ length: 12 }, (_, i) => `新词${i}`) }), ["原词"]);
    expect(terms).toHaveLength(12);
    expect(terms?.[0]).toBe("新词0");
  });
  it("always includes topic anchors for a goal, but keeps them out of specific-item queries", () => {
    const repair = { topicTerms: ["六级", "CET-6"], queryTerms: ["六级 真题", "六级 词汇"] };
    expect(repairedQueryTerms(JSON.stringify({ ...repair, scope: "goal" }), ["英语六级备考资料"]))
      .toEqual(["六级", "CET-6", "六级 真题", "六级 词汇", "英语六级备考资料"]);
    expect(repairedQueryTerms(JSON.stringify({ ...repair, scope: "specific" }), ["英语六级词汇书"]))
      .not.toContain("六级");
  });
});
