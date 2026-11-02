import { Type } from "@earendil-works/pi-ai";
import { Check } from "typebox/value";

// A retrieval repair may change wording only, never identity or hard filters.
export const RetrievalRepairSchema = Type.Object({
  scope: Type.Union([Type.Literal("goal"), Type.Literal("specific")]),
  topicTerms: Type.Array(Type.String({ minLength: 1, maxLength: 80, pattern: "\\S" }),
    { minItems: 1, maxItems: 4, uniqueItems: true }),
  queryTerms: Type.Array(Type.String({ minLength: 1, maxLength: 80, pattern: "\\S" }),
    { minItems: 1, maxItems: 12, uniqueItems: true }),
}, { additionalProperties: false });

export function repairedQueryTerms(text: string | undefined, previous: string[]): string[] | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, ""));
    if (!Check(RetrievalRepairSchema, value)) return undefined;
    const normalize = (term: string) => term.trim().replace(/\s+/gu, " ");
    // Goal searches must retain standalone topic anchors. Inferred directions
    // such as papers/vocabulary are optional branches, not mandatory subtypes.
    // A specific-item request only uses its constrained queries.
    const terms = [...new Set([
      ...(value.scope === "goal" ? value.topicTerms : []), ...value.queryTerms,
    ].map(normalize))];
    const existing = previous.map(normalize);
    if (terms.every(term => existing.includes(term))) return undefined;
    return [...new Set([...terms, ...existing])].slice(0, 12);
  } catch { return undefined; }
}
