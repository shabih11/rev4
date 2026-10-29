import { arabicReviewCount } from '../lib/arabicReviewCount';
import { useId, useState } from 'react';
import type { ReviewSummary } from '../context/DataContext';
import { weeklyActivity, newestFirst, reviewTimestamp } from '../lib/employeeActivity';
import { formatDateTime, toEnglishNumerals, formatDate } from '../lib/formatDate';

export function ActivityChart({ reviews, subject = 'employee', onPeriodSelect }: { reviews: (ReviewSummary & { comment?: string })[]; subject?: 'employee' | 'branch'; onPeriodSelect?: (period: { start: number; end: number }) => void }) {
  const branch = subject === 'branch';
  const positiveColor = branch ? '#0d9488' : '#16a34a';
  const negativeColor = branch ? '#7c3aed' : '#ef4444';
  const positiveText = branch ? 'text-teal-700' : 'text-green-700';
  const negativeText = branch ? 'text-violet-700' : 'text-red-600';
  const weeks = weeklyActivity(reviews);
  const [selected, setSelected] = useState<number | null>(null);
  const selectPeriod = (index: number) => {
    setSelected(index);
    onPeriodSelect?.({ start: weeks[index].start.getTime(), end: weeks[index].end.getTime() });
  };
  const gradient = useId().replace(/:/g, '');
  const max = Math.max(1, ...weeks.flatMap(week => [week.positive, week.negative]));
  const x = (index: number) => 40 + index * 520 / Math.max(1, weeks.length - 1);
  const y = (count: number) => 205 - count * 165 / max;
  const line = (key: 'negative' | 'positive') => weeks.map((week, index) => `${x(index)},${y(week[key])}`).join(' ');
  const format = (date: Date) => formatDate(`${date.getUTCDate()}-${date.getUTCMonth() + 1}-${date.getUTCFullYear()}`);
  const active = weeks[selected ?? weeks.length - 1];
  const selectedReviews = branch || selected === null ? [] : reviews.filter(review => {
    const date = reviewTimestamp({ date: review.date });
    return date >= active.start.getTime() && date <= active.end.getTime();
  }).sort(newestFirst);
  return <section className="bg-white p-4 rounded-2xl border shadow-sm space-y-4" aria-label={branch ? 'نشاط الفرع الأسبوعي خلال آخر ثلاثة أشهر' : 'نشاط الموظفة الأسبوعي خلال آخر ثلاثة أشهر'}>
    <div><h4 className="font-bold text-gray-800">{branch ? 'نشاط الفرع خلال آخر ثلاثة أشهر' : 'نشاطي خلال آخر ثلاثة أشهر'}</h4>{!branch && <p className="text-xs text-gray-500 mt-1">عدد التقييمات المرتبطة بالموظفة لكل أسبوع</p>}</div>
    <div className="flex flex-wrap gap-4 text-xs"><span className={positiveText}>━ التقييمات الإيجابية</span><span className={negativeText}>┄ التقييمات السلبية</span></div>
    <svg viewBox="0 0 600 245" className="w-full" role="group" aria-label="منحنى أسبوعي للتقييمات الإيجابية والسلبية" style={{ direction: 'ltr' }}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor={positiveColor} stopOpacity=".3"/><stop offset="1" stopColor={positiveColor} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3].map(level => <g key={level}><line x1="40" x2="560" y1={y(max * level / 3)} y2={y(max * level / 3)} stroke="#e5e7eb"/><text x="580" y={y(max * level / 3) + 4} fontSize="11" fill="#6b7280" textAnchor="middle">{Math.round(max * level / 3)}</text></g>)}
      <polygon points={`40,205 ${line('positive')} 560,205`} fill={`url(#${gradient})`}/>
      <polyline points={line('negative')} fill="none" stroke={negativeColor} strokeWidth="2" strokeDasharray="5 4"/>
      <polyline points={line('positive')} fill="none" stroke={positiveColor} strokeWidth="2.5"/>
      {weeks.map((week, index) => <g key={index} role="button" tabIndex={0} aria-pressed={selected === index} aria-label={`${format(week.start)}: ${week.positive} إيجابي، ${week.negative} سلبي`} onClick={() => selectPeriod(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPeriod(index); } }} className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
        <rect x={x(index) - 12} y="25" width="24" height="190" fill="transparent" className="cursor-pointer"><title>{format(week.start)}: {week.positive} إيجابي، {week.negative} سلبي</title></rect>
        <circle cx={x(index)} cy={y(week.positive)} r={selected === index ? 5 : 3} fill={positiveColor} className="cursor-pointer"/>
        <circle cx={x(index)} cy={y(week.negative)} r={selected === index ? 5 : 3} fill={negativeColor} className="cursor-pointer"/>
        {(index === 0 || index === weeks.length - 1 || index % 4 === 0) && <text x={x(index)} y="230" textAnchor="middle" fontSize="10" fill="#6b7280">{format(week.start)}</text>}
      </g>)}
    </svg>
    <p className="text-sm text-gray-600" role="status">{format(active.start)} – {format(active.end)}: <strong className={positiveText}>{arabicReviewCount(active.positive, 'positive')}</strong> و<strong className={negativeText}>{arabicReviewCount(active.negative, 'negative')}</strong></p>
    {!branch && selected !== null && <div className="space-y-3 border-t pt-4" aria-label="تقييمات الأسبوع المحدد">
      <h5 className="font-bold text-gray-800">تقييمات الأسبوع ({selectedReviews.length})</h5>
      {selectedReviews.map(review => {
        const rating = Math.min(5, Math.max(0, parseInt(toEnglishNumerals(review.rating), 10) || 0));
        return <article key={review.id} className="rounded-xl border bg-gray-50 p-3 space-y-2">
          <div className="flex justify-between gap-2 items-start"><span className="text-yellow-500" aria-label={`${rating} نجوم`}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span><span className="text-xs text-gray-500">{formatDateTime(review.date, review.time)}</span></div>
          <p className="text-sm text-gray-700">{review.comment !== undefined ? review.comment || 'تقييم بدون تعليق' : `تقييم ${rating} نجوم في فرع ${review.branch}، مرتبط بـ ${review.linkedEmployeeIds.length} من الموظفات.`}</p>
          <p className="text-xs text-blue-600">{review.branch}</p>
        </article>;
      })}
      {!selectedReviews.length && <p className="text-sm text-gray-500">لا توجد تقييمات في هذا الأسبوع.</p>}
    </div>}
    {!weeks.some(week => week.total) && <p className="text-sm text-gray-500">لا توجد تقييمات خلال هذه الفترة.</p>}
  </section>;
}
