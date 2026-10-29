import { useState } from 'react';
import type { TimelineEvent } from '../context/DataContext';
import { timeMinutes } from '../lib/formatDate';
import { reviewTimestamp } from '../lib/employeeActivity';

export function ShiftCalendar({ shifts, onSelect, unlinkedReviewDates = [], highlightEmployeeId, showMonthNavigation = true }: { shifts: TimelineEvent[]; onSelect: (date: string) => void; unlinkedReviewDates?: string[]; highlightEmployeeId?: string; showMonthNavigation?: boolean }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const unlinkedDays = new Set(unlinkedReviewDates.map(date => reviewTimestamp({ date })));
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <section className="bg-white p-5 sm:p-7 rounded-3xl shadow-sm border border-slate-200/80 space-y-6" dir="rtl">
    <h2 className="text-xl font-black text-slate-800">تقويم شفتات الفرع</h2>
    {showMonthNavigation && <div className="flex items-center justify-between bg-slate-50 border rounded-2xl p-2">
      <button aria-label="الشهر السابق" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>→</button>
      <strong>{month.toLocaleDateString('ar-SA-u-nu-latn', { calendar: 'gregory', month: 'long', year: 'numeric' })}</strong>
      <button aria-label="الشهر التالي" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>←</button>
    </div>}
    {unlinkedDays.size > 0 && <p className="text-xs font-bold text-blue-700">الأزرق: توجد تقييمات غير مرتبطة</p>}
    {highlightEmployeeId && <p className="text-xs font-bold text-emerald-800">الأخضر الغامق: شفت مسجل لكِ</p>}
    <div className="grid grid-cols-7 gap-2 sm:gap-3">
      {['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'].map(day => <span key={day} className="text-center text-xs text-slate-500">{day}</span>)}
      {Array.from({ length: month.getDay() }, (_, i) => <span key={`empty-${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const date = `${String(i + 1).padStart(2, '0')}-${String(month.getMonth() + 1).padStart(2, '0')}-${month.getFullYear()}`;
        const dayShifts = shifts.filter(s => s.date === date && s.employees?.length);
        const slots = new Set(dayShifts.map(s => (timeMinutes(s.time) ?? 0) < 960 ? 1 : 2)).size;
        const hasUnlinkedReviews = unlinkedDays.has(reviewTimestamp({ date }));
        const hasEmployeeShift = Boolean(highlightEmployeeId && dayShifts.some(shift => shift.employees?.some(employee => employee.id === highlightEmployeeId)));
        return <button data-employee-shift={hasEmployeeShift} title={hasUnlinkedReviews ? 'توجد تقييمات غير مرتبطة' : hasEmployeeShift ? 'أنتِ مسجلة في شفت بهذا اليوم' : undefined} key={date} onClick={() => onSelect(date)} className={`w-full aspect-square sm:h-20 flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl border ${hasUnlinkedReviews ? 'bg-blue-600 text-white border-blue-700 shadow-md' : hasEmployeeShift ? 'bg-emerald-700 text-white border-emerald-800 shadow-md' : !highlightEmployeeId && slots === 2 ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : slots ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          <span className="text-base sm:text-2xl font-black">{i + 1}</span><span className="text-[9px] sm:text-[10px] mt-1 font-bold">{slots === 2 ? 'شفتين ✓' : slots ? 'شفت 1' : '—'}</span>
        </button>;
      })}
    </div>
  </section>;
}
