import { parseDateStr, timeMinutes } from './formatDate';

// Dates are business dates in Riyadh, without converting them through UTC.
export function shiftWeekday(date?: string) {
  return date ? parseDateStr(date)?.getDay() : undefined;
}

export function normalizeFridayShift<T extends { type: string; date?: string; time: string; endTime?: string; endDate?: string }>(shift: T): T {
  if (shift.type !== 'shift') return shift;
  const weekday = shiftWeekday(shift.date);
  const minutes = timeMinutes(shift.time);
  if (minutes === null) return shift;
  if (weekday === 5 && minutes < 960) return { ...shift, time: '14:00' };
  if (weekday === 4 && minutes >= 960) {
    const nextDay = parseDateStr(shift.date!)!;
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    return { ...shift, time: '16:00', endTime: '14:00', endDate };
  }
  return shift;
}
