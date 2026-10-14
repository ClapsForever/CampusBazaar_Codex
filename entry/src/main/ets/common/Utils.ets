function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function formatTime(timestamp: number): string {
  const date: Date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatPrice(price: number): string {
  return `¥${price}`;
}

export function formatCondition(condition: string | undefined): string {
  if (condition === 'new') {
    return '全新';
  }
  if (condition === 'like_new') {
    return '近乎全新';
  }
  if (condition === 'good') {
    return '成色良好';
  }
  if (condition === 'fair') {
    return '有使用痕迹';
  }
  return '未注明';
}

export function isValidEmail(value: string): boolean {
  const email: string = value.trim();
  return email.length <= 254 && /^[\x21-\x7e]+$/.test(email) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.split('@')[0].length <= 64;
}

export function isValidPrice(text: string): boolean {
  const value: string = text.trim();
  if (!new RegExp('^\\d+(\\.\\d{1,2})?$').test(value)) {
    return false;
  }
  return Number(value) > 0;
}

export function parsePrice(text: string): number {
  return Number(text.trim());
}
