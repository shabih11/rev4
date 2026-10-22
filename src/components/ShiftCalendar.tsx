import { useState } from 'react';
import type { TimelineEvent } from '../context/DataContext';
import { timeMinutes } from '../lib/formatDate';

export function ShiftCalendar({ shifts, onSelect }: { shifts: TimelineEvent[]; onSelect: (date: string) => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <section className="bg-white p-5 sm:p-7 rounded-3xl shadow-sm border border-slate-200/80 space-y-6" dir="rtl">
    <h2 className="text-xl font-black text-slate-800">تقويم شفتات الفرع</h2>
    <div className="flex items-center justify-between bg-slate-50 border rounded-2xl p-2">
      <button aria-label="الشهر السابق" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>→</button>
      <strong>{month.toLocaleDateString('ar-SA', { calendar: 'gregory', month: 'long', year: 'numeric' })}</strong>
      <button aria-label="الشهر التالي" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>←</button>
    </div>
    <div className="grid grid-cols-7 gap-2 sm:gap-3">
      {['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'].map(day => <span key={day} className="text-center text-xs text-slate-500">{day}</span>)}
      {Array.from({ length: month.getDay() }, (_, i) => <span key={`empty-${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const date = `${String(i + 1).padStart(2, '0')}-${String(month.getMonth() + 1).padStart(2, '0')}-${month.getFullYear()}`;
        const dayShifts = shifts.filter(s => s.date === date && s.employees?.length);
        const slots = new Set(dayShifts.map(s => (timeMinutes(s.time) ?? 0) < 960 ? 1 : 2)).size;
        return <button key={date} onClick={() => onSelect(date)} className={`w-full aspect-square sm:h-20 flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl border ${slots === 2 ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : slots ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          <span className="text-base sm:text-2xl font-black">{i + 1}</span><span className="text-[9px] sm:text-[10px] mt-1 font-bold">{slots === 2 ? 'شفتين ✓' : slots ? 'شفت ١' : '—'}</span>
        </button>;
      })}
    </div>
  </section>;
}
