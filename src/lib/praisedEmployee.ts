const day = 86400000;
const anchor = Date.UTC(2026, 0, 1) - 3 * 3600000;
export function praiseCycle(now = Date.now()) {
  return anchor + Math.floor((now - anchor) / (2 * day)) * 2 * day;
}
export const nextPraiseCycle = (cycle: number) => cycle + 2 * day;
function reviewDay(value: string) {
  const normalized = value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
  const parts = normalized.split(/[-/]/).map(Number);
  if (parts.length !== 3) return NaN;
  const [year, month, date] = parts[0] > 1000 ? parts : [...parts].reverse();
  const stamp = Date.UTC(year, month - 1, date);
  const parsed = new Date(stamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date ? stamp - 3 * 3600000 : NaN;
}
// Use the completed week at the start of each shared two-day Riyadh cycle.
export function praisedEmployee(reviews: { date: string; linkedEmployeeIds: string[] }[], employees: { id: string }[], cycle: number) {
  const allowed = new Set(employees.map(employee => employee.id));
  const counts = new Map<string, number>();
  for (const review of reviews) {
    const stamp = reviewDay(review.date);
    if (!Number.isFinite(stamp) || stamp < cycle - 7 * day || stamp >= cycle) continue;
    for (const id of new Set(review.linkedEmployeeIds)) if (allowed.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const [id, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || ['', 0];
  return { id, count };
}
