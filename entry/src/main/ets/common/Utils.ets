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

export function isValidPhone(phone: string): boolean {
  return new RegExp('^\\d{11}$').test(phone.trim());
}

export function isValidSmsCode(code: string): boolean {
  return new RegExp('^\\d{6}$').test(code.trim());
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
