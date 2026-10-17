import type { TimelineEvent } from '../context/DataContext';
import { shiftReviewCounts, type ShiftReview } from '../lib/shiftReviewCounts';

export function ShiftReviewCounts({ shift, employeeId, reviews, ready }: { shift: TimelineEvent; employeeId: string; reviews: ShiftReview[]; ready: boolean }) {
  const counts = shiftReviewCounts(shift, employeeId, reviews);
  return <div className="flex shrink-0 items-center gap-1.5" aria-label="التقييمات المكتسبة في الشفت">
    <div className="min-w-10 rounded-xl border border-green-100 bg-green-50 px-2 py-1.5 text-center text-green-700" aria-label={ready ? `${counts.positive} تقييم إيجابي` : 'جارٍ تحميل التقييمات الإيجابية'}>
      <p className="text-lg font-extrabold leading-tight tabular-nums">{ready ? counts.positive : '—'}</p>
      <p className="text-[9px] font-medium">إيجابي</p>
    </div>
    <div className="min-w-10 rounded-xl border border-red-100 bg-red-50 px-2 py-1.5 text-center text-red-600" aria-label={ready ? `${counts.negative} تقييم سلبي` : 'جارٍ تحميل التقييمات السلبية'}>
      <p className="text-lg font-extrabold leading-tight tabular-nums">{ready ? counts.negative : '—'}</p>
      <p className="text-[9px] font-medium">سلبي</p>
    </div>
  </div>;
}
