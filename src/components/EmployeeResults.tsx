import { useData } from '../context/DataContext';
import { TierBadge } from './EmployeeFeatures';
import { employeeTier } from '../lib/employeeFeatures';
import type { UserAccount } from '../lib/mockData';
import { Award, Star, AlertTriangle, ShieldAlert } from 'lucide-react';

interface EmployeeResultsProps {
  user: UserAccount;
  ready: boolean;
  generatedAt: string;
  error: string | null;
}

// Summary readiness is separate from the optional review and shift detail queries.
export function EmployeeResults({ user, ready, error }: EmployeeResultsProps) {
  const { features } = useData();
  const tier = features ? employeeTier(user.points, features.settings) : 'bronze';
  const wallet = features?.store?.wallet;
  const period = new Intl.DateTimeFormat('ar-SA', {
    calendar: 'gregory', timeZone: 'Asia/Riyadh', month: 'long', year: 'numeric',
  }).format(new Date());

  return (
    <section aria-label="نتائجي" aria-busy={!ready && !error}>
      <div className="px-6 mb-4 text-sm text-gray-600 space-y-1">
        <p className="font-bold">فترة النتيجة: {period}</p>

      </div>
      {!ready ? (
        <div className="mx-6 mb-8 rounded-2xl border bg-white p-6">
          {error ? (
            <div role="alert" className="text-red-700 space-y-3">
              <p>تعذر تحميل النتائج. لا يمكن عرض نتيجة مؤكدة الآن.</p>
            </div>
          ) : <p role="status">جارٍ تحميل نتائجك…</p>}
        </div>
      ) : (
        <>
          <p className="px-6 mb-4 text-sm text-gray-600">
            النتيجة = الإيجابي ({user.stats.positive.toFixed(1)}) + رصيد التقييمات السلبية ({user.stats.negative.toFixed(1)}) + الجودة والسلامة ({Math.max(0, 4 - user.stats.complaints - user.stats.safety).toFixed(1)}).
          </p>
      {/* Main Stats */}
      <div className="px-6 mb-8">
        <div className="bg-white rounded-3xl p-8 shadow-xl flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-bold mb-1">نتيجة الشهر الحالي</p>
            <h2 className="text-5xl font-extrabold text-gray-800">{user.points.toFixed(1)}</h2>
          </div>
          <div className={`w-20 h-20 flex items-center justify-center ${tier === 'bronze' ? 'bg-blue-100 rounded-full text-blue-500' : ''}`}>
            {tier === 'bronze' ? <Award size={40} /> : <span className="text-5xl"><TierBadge employee={user} /></span>}
          </div>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="px-6 grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-yellow-400">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <Star className="text-yellow-400" size={20} />
            رصيد التقييمات
          </div>
          <p className="text-3xl font-extrabold">{wallet ? wallet.available.toLocaleString('ar-SA', { maximumFractionDigits: 2 }) : '…'}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-green-500">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <Star className="text-green-500" size={20} />
            إيجابي
          </div>
          <p className="text-3xl font-extrabold">+{user.stats.positive.toFixed(1)}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-red-500">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <AlertTriangle className="text-red-500" size={20} />
            شكاوى
          </div>
          <p className="text-3xl font-extrabold">-{user.stats.complaints}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-orange-500">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <ShieldAlert className="text-orange-500" size={20} />
            مخالفات سلامة
          </div>
          <p className="text-3xl font-extrabold">-{user.stats.safety}</p>
        </div>
      </div>


        </>
      )}
    </section>
  );
}
