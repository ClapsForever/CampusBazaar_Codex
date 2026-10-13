import type { ListingCondition, SearchFilters } from "../contracts/index.js";

/** Parse amounts independently of product classification, so a topic edit cannot erase money. */
export function chineseNumber(value: string): number {
  if (/^\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const [integer = "", fraction] = value.split("点");
  let total = 0, section = 0, digit = 0;
  if (!/[十百千万]/u.test(integer)) total = Number([...integer].map(c => digits[c] ?? "").join(""));
  else for (const c of integer) {
    if (digits[c] !== undefined) digit = digits[c];
    else if (c === "万") { total += (section + digit || 1) * 10000; section = 0; digit = 0; }
    else { section += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 }[c] ?? 0); digit = 0; }
  }
  if (/[十百千万]/u.test(integer)) total += section + digit;
  return total + (fraction ? Number(`0.${[...fraction].map(c => digits[c] ?? "").join("")}`) : 0);
}

function moneyText(message: string): string {
  return message.toLowerCase()
    .replace(/[零〇一二两三四五六七八九十百千万]+(?:点[零〇一二三四五六七八九]+)?/gu, value => String(chineseNumber(value)))
    .replace(/块钱?|人民币|\byuan\b|\brmb\b|\bcny\b/gu, "元");
}

// A negated cancellation must not relax a user constraint.
function requested(message: string, pattern: RegExp): boolean {
  for (const match of message.matchAll(new RegExp(pattern.source, "giu"))) {
    if (!/(?:不要|别|不准|不能|不允许|无需).{0,3}$/u.test(message.slice(0, match.index))) return true;
  }
  return false;
}

export function cancellation(message: string, field: "price" | "condition" | "campus" | "version"): boolean {
  const patterns = {
    price: /(?:取消|去掉|移除|删除|撤销).{0,6}(?:预算|价格|价钱)|(?:预算|价格|价钱).{0,6}(?:取消|去掉|不限|随意|不限制|无所谓|不设上限)|不限预算|不限制(?:价格|预算)|不(?:看|管|考虑|限制).{0,2}(?:价格|价钱|预算)|多少(?:钱|元|块)都(?:行|可以)|钱不是问题|no\s+(?:price|budget)\s+limit|ignore\s+(?:the\s+)?(?:price|budget)/iu,
    condition: /(?:取消|去掉|移除).{0,5}成色|(?:成色|新旧).{0,5}(?:不限|无所谓|都行|都可以|不限制)|不限成色|不(?:看|管|限制)成色|(?:新旧|旧的新的).{0,3}都可以/iu,
    campus: /(?:取消|去掉|移除).{0,5}校区|(?:校区|地点).{0,6}(?:不限|无所谓|都行|都可以|不限制)|不限校区|不限制校区|(?:哪|其他|其它|别的).{0,3}校区.{0,6}(?:都行|都可以|也行|也可以)|(?:优先|最好).{0,8}其他校区也可以/iu,
    version: /(?:取消|去掉|移除).{0,5}版本|(?:版本|哪一版).{0,5}(?:不限|无所谓|都行|都可以|不限制)|不限版本|不限制版本/iu,
  };
  return requested(message, patterns[field]);
}

export function priceDelta(message: string, previous: SearchFilters): { minPriceCents?: number | null; maxPriceCents?: number | null } {
  if (cancellation(message, "price")) return { minPriceCents: null, maxPriceCents: null };
  const text = moneyText(message);
  const amount = "(\\d+(?:\\.\\d+)?)";
  const cents = (value: string | undefined) => Math.round(Number(value) * 100);
  const relative = text.match(new RegExp(`(?:再|还)?便宜\\s*${amount}\\s*元|(?:预算|价格).{0,3}(?:降低|减少|下调|降)\\s*${amount}\\s*元|(?:再|还)?(?:下调|降低|减少|少花)\\s*${amount}\\s*元`, "u"));
  if (relative) return previous.maxPriceCents !== undefined ? { maxPriceCents: Math.max(0, previous.maxPriceCents - cents(relative[1] ?? relative[2] ?? relative[3])) } : {};
  const range = text.match(new RegExp(`${amount}\\s*元?\\s*(?:到|至|[-~～])\\s*${amount}\\s*元`, "u"));
  if (range) return { minPriceCents: cents(range[1]), maxPriceCents: cents(range[2]) };
  const lower = text.match(new RegExp(`(?:至少|不低于|最低|下限|at least|over)\\s*${amount}\\s*元?`, "u"));
  const upper = text.match(new RegExp(`(?:不(?:要)?超过|别超过|最多|上限|低于|小于|under|below|at most)\\s*${amount}\\s*元?`, "u"))
    ?? text.match(new RegExp(`${amount}\\s*元?\\s*(?:以内|以下|封顶|预算)`, "u"))
    ?? text.match(new RegExp(`(?:预算|budget)(?:改成|调整为|提高到|降低到|仍然|还是|上限|是|为|就|只有|:|：|\\s){0,6}${amount}\\s*元?`, "u"));
  const update: { minPriceCents?: number | null; maxPriceCents?: number | null } = {};
  if (upper) { update.maxPriceCents = cents(upper[1]); update.minPriceCents = lower ? cents(lower[1]) : null; }
  else if (lower) update.minPriceCents = cents(lower[1]);
  return update;
}

export function mentionsMoney(message: string): boolean {
  return /(?:\d|[零〇一二两三四五六七八九十百千万]).{0,5}(?:元|块|yuan|rmb|cny)|(?:预算|价格|budget|under|below|at most|至少|最多).{0,12}(?:\d|[一二两三四五六七八九十百千万])/iu.test(message);
}

export function relativePriceRequested(message: string): boolean {
  return /(?:便宜|降低|减少|下调|少花)\s*\d+(?:\.\d+)?\s*元/u.test(moneyText(message));
}

export function explicitVersion(message: string): string | undefined {
  return message.match(/(?:同济)?第[一二三四五六七八九十\d]+版|20\d{2}版/u)?.[0];
}

export function conditionMentioned(message: string): boolean {
  return /成色|成新|全新|未使用|没用过|未用过|未拆封|未开封|崭新|新旧|brand new|unused/iu.test(message);
}

export function explicitCondition(message: string): ListingCondition | undefined {
  for (const match of message.matchAll(/全新|未使用|没用过|未用过|未拆封|未开封|崭新|brand new|unused|([七八九十789]|10)成新/giu)) {
    if (/(?:不要|不用|不需要|不必|排除|非).{0,2}$/u.test(message.slice(0, match.index))) continue;
    const score = match[1];
    return !score || score === "十" || score === "10" ? "new" : score === "九" || score === "9" ? "like_new" : score === "八" || score === "8" ? "good" : "fair";
  }
  return undefined;
}

export function explicitCampus(message: string): { name: string; soft: boolean } | undefined {
  for (const clause of message.split(/[，,。；;！？!?\n]/u)) {
    const name = ["江湾", "邯郸", "张江", "枫林"].find(value => clause.includes(value));
    if (name) return { name: `${name}校区`, soft: /最好|优先|方便|希望|尽量/u.test(clause) && !/只要|必须|仅限|一定|只看/u.test(clause) };
  }
  return undefined;
}

export function purposeTopic(message: string): { keyword: string; category: string } | undefined {
  // Only a small supported purpose vocabulary is inferred; identities and permissions never are.
  if (/教材|课本|教程/u.test(message)) return undefined;
  if (/照明|(?:熄灯|夜间|晚上).{0,8}(?:看书|阅读|学习)|(?:看书|阅读).{0,5}太暗/u.test(message)) return { keyword: "台灯", category: "日用" };
  if (/校(?:内|园).{0,6}通勤|骑着.{0,4}(?:上课|赶课)/u.test(message)) return { keyword: "自行车", category: "运动" };
  return undefined;
}

export function requestedPage(message: string, previousPage: number): number | undefined {
  const explicit = message.match(/第\s*([\d一二三四五六七八九十百]+)\s*页/u)?.[1];
  if (explicit) return chineseNumber(explicit);
  if (/下一页|换一批|再来|继续|还有(?:其他|别的|更多)|接着(?:看|往后)|next\s+page|show\s+more/iu.test(message)) return previousPage + 1;
  return undefined;
}

export function rankingDelta(message: string): Pick<SearchFilters, "sort" | "resultLimit"> {
  if (/最便宜|最低价|cheapest/iu.test(message)) return { sort: "price_asc", ...(/一个|一件|一款|只给|cheapest\s+one/iu.test(message) ? { resultLimit: 1 } : {}) };
  if (/从低到高|价格升序|便宜的(?:排|在)前/u.test(message)) return { sort: "price_asc" };
  if (/从高到低|价格降序/u.test(message)) return { sort: "price_desc" };
  if (/最新|最近发布/u.test(message)) return { sort: "published_desc" };
  return {};
}
