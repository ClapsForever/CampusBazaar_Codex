// These groups match the App's MarketOptions and the business API's search groups.
export const CATEGORY_GROUPS = [
  { category: "教材", members: ["教材", "图书", "书籍"] },
  { category: "数码", members: ["数码", "手机", "电脑", "平板", "相机", "计算器"] },
  { category: "外设", members: ["外设", "键盘", "鼠标", "耳机", "显示器", "音箱", "充电器"] },
  { category: "日用", members: ["日用", "生活", "生活用品", "台灯", "收纳"] },
  { category: "运动", members: ["运动", "出行", "自行车", "单车", "运动用品"] },
  { category: "其他", members: ["其他"] },
];

export function matchesCategory(
  storedCategory: string, query: string | undefined, text: string, expand: (keyword: string) => string[][],
): boolean {
  if (!query) return true;
  const group = CATEGORY_GROUPS.find(item => item.members.includes(query));
  if (!group) return storedCategory === query;
  if (query === group.category || ["生活", "生活用品", "出行", "运动用品", "图书", "书籍"].includes(query)) {
    return group.members.includes(storedCategory);
  }
  const keywords = expand(query)[0] ?? [query];
  return keywords.includes(storedCategory)
    || (storedCategory === group.category && keywords.some(keyword => text.toLowerCase().includes(keyword)));
}
