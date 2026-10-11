import { priceText, type SearchFilters } from "../contracts/index.js";

/**
 * Keep the API reply easy to render in a plain HarmonyOS text component.
 * JSON serialization will still escape real line breaks as `\n` on the wire;
 * clients should parse JSON before displaying this value.
 */
export function normalizeReply(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\([*_`])/g, "$1")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function noResultsReply(filters: SearchFilters): string {
  const conditions: string[] = [];
  if (filters.keyword) conditions.push(`关键词：${filters.keyword}`);
  if (filters.category) conditions.push(`类别：${filters.category}`);
  if (filters.minPriceCents !== undefined) conditions.push(`价格至少 ${priceText(filters.minPriceCents)}`);
  if (filters.maxPriceCents !== undefined) conditions.push(`价格不超过 ${priceText(filters.maxPriceCents)}`);
  if (filters.campus) conditions.push(`取货校区：${filters.campus}`);
  if (filters.version) conditions.push(`版本：${filters.version}`);
  const labels = { new: "全新", like_new: "九成新", good: "八成新", fair: "七成新", unknown: "未知" };
  if (filters.condition) conditions.push(`成色：${labels[filters.condition]}`);
  const active = conditions.length ? `当前筛选条件：${conditions.join("；")}。\n` : "";
  const budgetHint = filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined
    ? "可以明确说“取消预算限制”，或点击“新对话”重新搜索。"
    : "可以明确调整条件，或点击“新对话”重新搜索。";
  return `没有找到同时满足明确条件的商品。\n${active}同一对话会保留之前的筛选条件。${budgetHint}`;
}
