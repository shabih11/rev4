import { useData } from '../context/DataContext';
import { TierBadge } from './EmployeeFeatures';
import { employeeTier } from '../lib/employeeFeatures';
import type { UserAccount } from '../lib/mockData';
import { Award, ChevronDown } from 'lucide-react';

interface EmployeeResultsProps {
  user: UserAccount;
  ready: boolean;
  error: string | null;
}

export function EmployeeResults({ user, ready, error }: EmployeeResultsProps) {
  const { features } = useData();
  const tier = features ? employeeTier(user.points, features.settings) : 'bronze';
  return <section aria-label="نتائجي" aria-busy={!ready && !error} className="px-6 mb-8">
    {!ready || error ? <div className="rounded-2xl border bg-white p-6">
      {error ? <p role="alert" className="text-red-700">تعذر تحميل النتائج. لا يمكن عرض نتيجة مؤكدة الآن.</p> : <p role="status">جارٍ تحميل نتائجك…</p>}
    </div> : <details className="group bg-white rounded-3xl shadow-sm border border-slate-100">
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 p-6 sm:p-8 rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <div>
          <h2 className="text-gray-500 font-bold mb-1">نتيجة الشهر الحالي</h2>
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
          ['إيجابي', user.stats.positive.toFixed(1), 'text-green-700'],
          ['رصيد التقييمات السلبية', user.stats.negative.toFixed(1), 'text-slate-700'],
          ['الجودة والسلامة', Math.max(0, 4 - user.stats.complaints - user.stats.safety).toFixed(1), 'text-blue-700'],
          ['شكاوى', `-${user.stats.complaints}`, 'text-red-700'],
          ['مخالفات سلامة', `-${user.stats.safety}`, 'text-orange-700'],
        ].map(([label, value, color]) => <div key={label} className="rounded-2xl bg-slate-50 p-3">
          <dt className="text-xs sm:text-sm font-bold text-slate-600">{label}</dt>
          <dd className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</dd>
        </div>)}
      </dl>
    </details>}
  </section>;
}
