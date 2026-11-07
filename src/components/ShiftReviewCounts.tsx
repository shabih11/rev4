import { arabicReviewCount } from '../lib/arabicReviewCount';
import type { TimelineEvent } from '../context/DataContext';
import { shiftReviewCounts, type ShiftReview } from '../lib/shiftReviewCounts';

export function ShiftReviewCounts({ shift, employeeId, reviews, ready }: { shift: TimelineEvent; employeeId: string; reviews: ShiftReview[]; ready: boolean }) {
  const counts = shiftReviewCounts(shift, employeeId, reviews);
  return <div className="flex shrink-0 items-center gap-1.5" aria-label="التقييمات المكتسبة في الشفت">
    <div className="min-w-10 rounded-xl border border-green-100 bg-green-50 px-2 py-1.5 text-center text-green-700" aria-label={ready ? arabicReviewCount(counts.positive, 'positive') : 'جارٍ تحميل التقييمات الإيجابية'}>
      <p className="text-xs font-bold leading-tight">{ready ? arabicReviewCount(counts.positive, 'positive') : '—'}</p>
    </div>
    {ready && counts.negative > 0 && <div className="min-w-10 rounded-xl border border-red-100 bg-red-50 px-2 py-1.5 text-center text-red-600" aria-label={arabicReviewCount(counts.negative, 'negative')}>
      <p className="text-xs font-bold leading-tight">{arabicReviewCount(counts.negative, 'negative')}</p>
    </div>}
  </div>;
}
