import type { UserAccount } from '../lib/mockData';
import { Award, Star, AlertTriangle, ShieldAlert } from 'lucide-react';

interface EmployeeResultsProps {
  user: UserAccount;
  ready: boolean;
  generatedAt: string;
  error: string | null;
}

// Summary readiness is separate from the optional review and shift detail queries.
export function EmployeeResults({ user, ready, generatedAt, error }: EmployeeResultsProps) {
  const timestamp = Date.parse(generatedAt);
  const updatedAt = Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('ar-SA', {
        calendar: 'gregory', timeZone: 'Asia/Riyadh',
        dateStyle: 'medium', timeStyle: 'short',
      }).format(timestamp)
    : null;
  const period = new Intl.DateTimeFormat('ar-SA', {
    calendar: 'gregory', timeZone: 'Asia/Riyadh', month: 'long', year: 'numeric',
  }).format(new Date());

  const metrics = [
    { label: 'إجمالي التقييمات', value: String(user.reviewsCount), Icon: Star, color: 'text-blue-600' },
    { label: 'إيجابي', value: `+${user.stats.positive.toFixed(1)}`, Icon: Star, color: 'text-emerald-700' },
    { label: 'شكاوى', value: `-${user.stats.complaints}`, Icon: AlertTriangle, color: 'text-red-700' },
    { label: 'مخالفات سلامة', value: `-${user.stats.safety}`, Icon: ShieldAlert, color: 'text-amber-700' },
  ];
  return (
    <section className="results" aria-label="نتائجي" aria-busy={!ready && !error}>
      <div className="results-meta">
        <p>فترة النتيجة: {period}</p>
        {updatedAt && <p>آخر تحديث: <time dateTime={generatedAt}>{updatedAt}</time> بتوقيت الرياض</p>}
        {ready && !updatedAt && <p>تاريخ إعداد الملخص غير متاح.</p>}
      </div>
      {!ready ? (
        <div className="result-state">
          {error ? <p role="alert" className="text-red-700">تعذر تحميل النتائج. لا يمكن عرض نتيجة مؤكدة الآن.</p> : <p role="status">جارٍ تحميل نتائجك…</p>}
        </div>
      ) : <>
        <div className="results-score">
          <div><p>نتيجة الشهر الحالي</p><h2 dir="ltr">{user.points.toFixed(1)}</h2><p>{period}</p></div>
          <Award size={56} strokeWidth={1.25} aria-hidden="true" />
        </div>
        <p className="results-formula">
          <span>الإيجابي {user.stats.positive.toFixed(1)}</span>
          <span>رصيد السلبية {user.stats.negative.toFixed(1)}</span>
          <span>الجودة {Math.max(0, 4 - user.stats.complaints - user.stats.safety).toFixed(1)}</span>
        </p>
        <dl className="results-grid">
          {metrics.map(({ label, value, Icon, color }) => <div key={label} className="result-metric">
            <dt><Icon size={17} className={color} aria-hidden="true" />{label}</dt>
            <dd dir="ltr" className="text-right">{value}</dd>
          </div>)}
        </dl>
      </>}
      <p className="results-meta mt-4">تصل تحديثات الملخص تلقائياً؛ افتحي السجلات للاطلاع على التفاصيل.</p>
    </section>
  );
}
