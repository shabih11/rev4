import { riyadhDateKey } from './formatDate';
const DAY = 86_400_000;
export function canRequestShift(date: string, now = Date.now()): boolean {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
  if (!match) return false;
  const [, day, month, year] = match;
  const shift = Date.UTC(+year, +month - 1, +day);
  if (new Date(shift).getUTCDate() !== +day || new Date(shift).getUTCMonth() !== +month - 1) return false;
  const [todayDay, todayMonth, todayYear] = riyadhDateKey(new Date(now)).split('-').map(Number);
  const age = Date.UTC(todayYear, todayMonth - 1, todayDay) - shift;
  return age >= 0 && age < 3 * DAY;
}
export function canAppeal(rejectedAt: number | undefined, now = Date.now()): boolean {
  return typeof rejectedAt === 'number' && Number.isFinite(rejectedAt) && now >= rejectedAt && now < rejectedAt + 3 * DAY;
}
