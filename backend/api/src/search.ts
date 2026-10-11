const equivalents = [
  ['高数', '高等数学', '微积分'],
  ['英语', '英文', 'english'],
  ['书', '书籍', '课本', '教材', 'book', 'books', 'textbook', 'textbooks']
];

/** Expand known equivalents within a term; separate terms must still all match. */
export function keywordGroups(keyword: string): string[][] {
  const normalized = keyword.toLowerCase().replace(/(英语|英文)(书籍|课本|教材|书)/gu, '$1 $2');
  return normalized.split(/\s+/u).filter(Boolean).slice(0, 8)
    .map(term => equivalents.find(aliases => aliases.includes(term)) ?? [term]);
}
