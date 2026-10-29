import { useData } from '../context/DataContext';
import { TierBadge } from './EmployeeFeatures';
import { useRecordScope } from '../hooks/useRecordScope';
import { formatDate } from '../lib/formatDate';
import { employeeQualityPoints, qualityDeductions } from '../lib/employeeQuality';
import { employeeTier } from '../lib/employeeFeatures';
import type { UserAccount } from '../lib/mockData';
import { Award, ChevronDown } from 'lucide-react';

interface EmployeeResultsProps {
  user: UserAccount;
  ready: boolean;
  error: string | null;
}

export function EmployeeResults({ user, ready, error }: EmployeeResultsProps) {
  const { features, reviewSummaries, timeline, recordsReady, syncError } = useData();
  useRecordScope({ timeline: { employeeIds: [user.id] } });
  const quality = employeeQualityPoints(user.stats);
  const deductions = qualityDeductions(user, reviewSummaries, timeline);
  const reasons = { review: 'رصيد تقييم سلبي', complaint: 'شكوى مؤكدة', safety: 'حادث سلامة', 'review-balance': 'رصيد جودة التقييمات المسجل', 'conduct-balance': 'رصيد الشكاوى المؤكدة وحوادث السلامة المسجل' };
  const tier = features ? employeeTier(user.points, features.settings) : 'bronze';
  return <section aria-label="نتائجي" aria-busy={!ready && !error} className="px-6 mb-8">
    {!ready || error ? <div className="rounded-2xl border bg-white p-6">
      {error ? <p role="alert" className="text-red-700">تعذر تحميل النتائج. لا يمكن عرض نتيجة مؤكدة الآن.</p> : <p role="status">جارٍ تحميل نتائجك…</p>}
    </div> : <details className="group bg-white rounded-3xl shadow-sm border border-slate-100">
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 p-6 sm:p-8 rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <div>
          <h2 className="text-gray-500 font-bold mb-1">نقاط الشهر الحالي</h2>
          <p className="text-5xl font-extrabold text-gray-800">{user.points.toFixed(1)}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-16 h-16 flex items-center justify-center ${tier === 'bronze' ? 'bg-blue-100 rounded-full text-blue-500' : ''}`}>
            {tier === 'bronze' ? <Award size={36} /> : <TierBadge employee={user} />}
          </div>
          <ChevronDown size={20} aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <dl aria-label="تفاصيل نقاط الشهر الحالي" className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4 sm:p-6">
        {[
          ['رصيد التقييمات', String(user.monthReviewsCount ?? 0), 'text-amber-700'],
          ['نقاط الإيجابية', user.stats.positive.toFixed(1), 'text-green-700'],
          ['الجودة (تقييمات سلبية، حوادث سلامة، شكاوى مؤكدة)', quality.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }), 'text-blue-700'],
        ].map(([label, value, color]) => <div key={label} className="rounded-2xl bg-slate-50 p-3 last:col-span-2">
          <dt className="text-xs sm:text-sm font-bold text-slate-600">{label}</dt>
          <dd className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</dd>
        </div>)}
      </dl>
      {quality < 6 && <div className="px-4 pb-4 sm:px-6 sm:pb-6 text-sm text-slate-600" aria-label="أسباب نقص الجودة">
        <p className="font-bold mb-2">نقص {(6 - quality).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} من ٦ نقاط</p>
        {!recordsReady ? <p role="status">جارٍ تحميل أسباب النقص…</p> : syncError ? <p role="alert">تعذر تحميل تفاصيل أسباب النقص.</p> : <ul className="space-y-1">
          {deductions.map((deduction, index) => <li key={index}>نقص {deduction.amount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} بسبب {reasons[deduction.kind]}{deduction.date ? ` في تاريخ ${formatDate(deduction.date).replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])}` : '؛ تفاصيل التاريخ غير متاحة أو لا تتطابق مع الرصيد المسجل.'}</li>)}
        </ul>}
      </div>}

    </details>}
  </section>;
}
