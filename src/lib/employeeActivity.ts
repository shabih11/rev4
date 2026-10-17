import type { ReviewSummary } from '../context/DataContext';
import { toEnglishNumerals } from './formatDate';
import { isInCurrentMonth, isPositiveReview } from './reviewPeriod';

export function reviewTimestamp(review: { date?: string; time?: string }) {
  const [day, month, year] = toEnglishNumerals(review.date || '').split('-').map(Number);
  const [hour = 0, minute = 0] = toEnglishNumerals(review.time || '').split(':').map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
export const newestFirst = (a: { date?: string; time?: string }, b: { date?: string; time?: string }) => reviewTimestamp(b) - reviewTimestamp(a);

export function favoritePartner(employeeId: string, reviews: ReviewSummary[], now = new Date()) {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    if (!isInCurrentMonth(review.date, now) || !isPositiveReview(review.rating) || !review.linkedEmployeeIds.includes(employeeId)) continue;
    for (const id of new Set(review.linkedEmployeeIds)) if (id !== employeeId) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const [id, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || ['', 0];
  return { id, count };
}

export function weeklyActivity(reviews: ReviewSummary[], now = new Date()) {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(local.find(value => value.type === type)?.value);
  const end = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 3);
  start.setUTCDate(Math.min(end.getUTCDate(), new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()));
  const dayMs = 86400000;
  const firstWeek = new Date(start);
  firstWeek.setUTCDate(firstWeek.getUTCDate() - firstWeek.getUTCDay());
  const buckets = Array.from({ length: Math.floor((end.getTime() - firstWeek.getTime()) / (7 * dayMs)) + 1 }, (_, index) => {
    const date = new Date(firstWeek.getTime() + index * 7 * dayMs);
    const from = new Date(Math.max(date.getTime(), start.getTime()));
    const to = new Date(Math.min(date.getTime() + 6 * dayMs, end.getTime()));
    return { start: from, end: to, total: 0, positive: 0, negative: 0 };
  });
  for (const review of reviews) {
    const timestamp = reviewTimestamp({ date: review.date });
    if (timestamp < start.getTime() || timestamp > end.getTime()) continue;
    const index = Math.floor((timestamp - firstWeek.getTime()) / (7 * dayMs));
    if (buckets[index]) { buckets[index].total++; if (isPositiveReview(review.rating)) buckets[index].positive++;
      const rating = parseInt(toEnglishNumerals(review.rating), 10);
      if (rating === 1 || rating === 2) buckets[index].negative++; }
  }
  return buckets;
}

export function monthlyEmployeeOrder(a: { monthReviewsCount?: number; name: string; id: string }, b: { monthReviewsCount?: number; name: string; id: string }) {
  return (b.monthReviewsCount || 0) - (a.monthReviewsCount || 0) || a.name.localeCompare(b.name, 'ar') || a.id.localeCompare(b.id);
}
