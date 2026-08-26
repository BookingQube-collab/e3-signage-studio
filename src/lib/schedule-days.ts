export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function daysToNumbers(days: string[]): number[] {
  const nums = days
    .map((label) => WEEKDAY_LABELS.indexOf(label as (typeof WEEKDAY_LABELS)[number]))
    .filter((n) => n >= 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function numbersToDays(nums: number[]): string[] {
  return [...new Set(nums)]
    .filter((n) => n >= 0 && n <= 6)
    .sort((a, b) => a - b)
    .map((n) => WEEKDAY_LABELS[n] ?? "Sun");
}

export function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

export function uiTime(value: string): string {
  return value.slice(0, 5);
}
