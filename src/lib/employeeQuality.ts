import { isInCurrentMonth } from './reviewPeriod';
import { toEnglishNumerals } from './formatDate';
import type { UserAccount } from './mockData';

// Display the existing review-quality credit and complaint/safety credit as one score.
export function employeeQualityPoints(stats: UserAccount['stats']) {
  return Math.min(6, Math.max(0, stats.negative + Math.max(0, 4 - stats.complaints - stats.safety)));
}

export type QualityDeduction = {
  kind: 'review' | 'complaint' | 'safety' | 'review-balance' | 'conduct-balance';
  amount: number;
  date?: string;
};

// Attribute dates only when the available records reconcile with the saved score.
export function qualityDeductions(
  employee: Pick<UserAccount, 'id' | 'stats'>,
  reviews: { id: string; date: string; rating: string; linkedEmployeeIds: string[] }[],
  notes: { id: string; type: string; date?: string; title: string; employees?: { id: string }[] }[],
  now = new Date(),
): QualityDeduction[] {
  const totalLoss = 6 - employeeQualityPoints(employee.stats);
  if (totalLoss <= 0) return [];
  const reviewLoss = Math.min(totalLoss, Math.max(0, 2 - employee.stats.negative));
  const conductLoss = totalLoss - reviewLoss;
  const reviewEvents: QualityDeduction[] = [], conductEvents: QualityDeduction[] = [];
  const seenReviews = new Set<string>(), seenNotes = new Set<string>();
  for (const review of reviews) {
    if (seenReviews.has(review.id) || !review.linkedEmployeeIds.includes(employee.id) || !isInCurrentMonth(review.date, now)) continue;
    seenReviews.add(review.id);
    const rating = parseInt(toEnglishNumerals(review.rating), 10);
    if (rating === 1 || rating === 2) reviewEvents.push({ kind: 'review', amount: 0.5 / review.linkedEmployeeIds.length, date: review.date });
  }
  for (const note of notes) {
    if (seenNotes.has(note.id) || note.type !== 'gap' || !note.employees?.some(item => item.id === employee.id) || !isInCurrentMonth(note.date, now)) continue;
    seenNotes.add(note.id);
    if (note.title.includes('شكوى')) conductEvents.push({ kind: 'complaint', amount: 1, date: note.date });
    if (note.title.includes('سلامة')) conductEvents.push({ kind: 'safety', amount: 1, date: note.date });
  }
  function group(loss: number, events: QualityDeduction[], fallback: QualityDeduction['kind']) {
    if (loss <= 0) return [];
    return Math.abs(events.reduce((sum, event) => sum + event.amount, 0) - loss) < 0.000001
      ? events : [{ kind: fallback, amount: loss }];
  }
  return [...group(reviewLoss, reviewEvents, 'review-balance'), ...group(conductLoss, conductEvents, 'conduct-balance')];
}
