import { toEnglishNumerals } from './formatDate';

// Review dates are stored as DD-MM-YYYY in Riyadh's local calendar.
export function isInCurrentMonth(date: string | undefined, now = new Date()): boolean {
  if (!date) return false;
  const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(toEnglishNumerals(date));
  if (!match) return false;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return false;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const part = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return year === part('year') && month === part('month') && day <= part('day');
}

export const isPositiveReview = (rating: string) => {
  const value = parseInt(toEnglishNumerals(rating), 10);
  return value === 4 || value === 5;
};
