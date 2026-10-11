/** Display groups never replace the concrete category stored by the API. */
export const HOME_CATEGORIES: string[] = ['全部', '教材', '数码', '生活', '出行'];
export interface CategoryOption {
  value: string;
  group: string;
}
export const PRODUCT_CATEGORIES: CategoryOption[] = [
  { value: '教材', group: '教材' },
  { value: '耳机', group: '数码' },
  { value: '键盘', group: '数码' },
  { value: '显示器', group: '数码' },
  { value: '计算器', group: '数码' },
  { value: '自行车', group: '出行' },
  { value: '生活用品', group: '生活' },
  { value: '其他', group: '全部' }
];
export const CAMPUS_OPTIONS: string[] = ['江湾校区', '邯郸校区', '张江校区', '枫林校区'];
export const CONDITION_OPTIONS: string[] = ['new', 'like_new', 'good', 'fair', 'unknown'];

export function homeCategory(category: string | undefined): string {
  const value: string = (category || '').trim();
  const canonical: string = value === '单车' ? '自行车' : value;
  for (const option of PRODUCT_CATEGORIES) {
    if (option.value === canonical) {
      return option.group;
    }
  }
  return ['数码', '生活', '出行'].includes(canonical) ? canonical : '全部';
}

export function isPublishCategory(category: string): boolean {
  return PRODUCT_CATEGORIES.some((option: CategoryOption): boolean => option.value === category);
}
