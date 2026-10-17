import type { ReviewSummary, TimelineEvent } from '../context/DataContext';
import { timeMinutes, toEnglishNumerals } from './formatDate';
import { reviewTimestamp } from './employeeActivity';

export type ShiftReview = ReviewSummary & { linkedShiftId?: string };
export function shiftReviewCounts(shift: TimelineEvent, employeeId: string, reviews: ShiftReview[]) {
  const date = reviewTimestamp({ date: shift.date });
  const startMinutes = timeMinutes(shift.time);
  const endMinutes = timeMinutes(shift.endTime || '00:00');
  const start = date + (startMinutes || 0) * 60000;
  let end = (shift.endDate ? reviewTimestamp({ date: shift.endDate }) : date) + (endMinutes || 0) * 60000;
  if (end <= start) end += 86400000;
  const counts = { positive: 0, negative: 0 };
  const seen = new Set<string>();
  for (const review of reviews) {
    if (seen.has(review.id) || review.branch !== shift.branch || !review.linkedEmployeeIds.includes(employeeId)) continue;
    const minutes = timeMinutes(review.time);
    const timestamp = reviewTimestamp({ date: review.date }) + (minutes || 0) * 60000;
    const matches = review.linkedShiftId ? review.linkedShiftId === shift.id :
      Boolean(shift.date && startMinutes !== null && minutes !== null && timestamp >= start && timestamp < end);
    if (!matches) continue;
    seen.add(review.id);
    const rating = parseInt(toEnglishNumerals(review.rating), 10);
    if (rating === 4 || rating === 5) counts.positive++;
    if (rating === 1 || rating === 2) counts.negative++;
  }
  return counts;
}
