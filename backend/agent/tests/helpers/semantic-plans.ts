import type { SearchFilters } from "../../src/contracts/index.js";

/** Synthetic model responses for tests only; never imported by production code. */
export function mockSemanticTopic(message: string): SearchFilters | undefined {
  const linear = message.match(/线性代数|线代|linear algebra/iu)?.[0];
  if (linear) return { keyword: linear, category: "教材", queryTerms: ["线性代数", "线代", "linear algebra"] };
  const exam = message.match(/六级|CET[- ]?6/iu)?.[0];
  if (exam) {
    const subject = /词汇|单词/u.test(message) ? "词汇" : /真题|试卷/u.test(message) ? "真题" : undefined;
    return {
      keyword: subject ? `${exam}${subject}` : exam,
      category: "教材",
      queryTerms: subject === "词汇" ? ["六级 词汇", "六级 单词", "CET6 vocabulary", "CET-6 vocabulary"]
        : subject === "真题" ? ["六级 真题", "六级 试卷", "CET6 test", "CET-6 test"]
        : ["六级", "CET6", "CET-6", "CET 6"],
    };
  }
  return undefined;
}
