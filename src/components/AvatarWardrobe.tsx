import { useState } from 'react';
import { useData } from '../context/DataContext';
import { employeeTier, allowedAccessories } from '../lib/employeeFeatures';
import type { Accessory } from '../lib/employeeFeatures';
import { supabase } from '../lib/supabase';
import { EmployeeAvatar } from './EmployeeFeatures';
import type { UserAccount } from '../lib/mockData';
const labels: Record<Accessory, string> = { shawl: 'شال أنيق', brooch: 'دبوس جوهرة', veil: 'برقع ذهبي' };
export function AvatarWardrobe({ employee }: { employee: UserAccount }) {
  const { features } = useData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!features?.settings.avatars || !features.settings.tiers || employee.role !== 'employee') return null;
  const tier = employeeTier(employee.points, features.settings);
  const allowed = allowedAccessories(tier);
  const selected = features.accessories[employee.id] || [];
  return <section className="rounded-3xl bg-white border p-6 space-y-4">
    <div className="flex items-center gap-5"><EmployeeAvatar employee={employee} className="h-28 w-28 shrink-0" /><div><h3 className="font-bold text-lg">لمستك الخاصة</h3><p className="text-sm text-slate-600 mt-2">زيّني أفتارك الحالي بإكسسوارات فئتك.</p></div></div>
    {!allowed.length && <p className="text-sm text-slate-600">تُفتح الإكسسوارات عند الوصول للفئة الفضية.</p>}
    <div className="flex flex-wrap gap-3">{(Object.keys(labels) as Accessory[]).map(item => <button key={item} type="button" aria-pressed={selected.includes(item) && allowed.includes(item)} disabled={busy || !allowed.includes(item)} className={`rounded-xl border px-4 py-3 text-sm font-bold disabled:opacity-50 ${selected.includes(item) && allowed.includes(item) ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-300 text-slate-800'}`} onClick={async () => {
      setBusy(true); setMessage('');
      const next = selected.includes(item) ? selected.filter(value => value !== item) : [...selected.filter(value => allowed.includes(value)), item];
      const { error } = await supabase.rpc('save_my_accessories', { requested: next });
      setBusy(false); setMessage(error ? 'تعذر الحفظ. تحققي من الاتصال وفئتك الحالية.' : 'تم حفظ إكسسواراتك.');
      if (!error) window.dispatchEvent(new Event('rev4-cache-changed'));
    }}>{labels[item]}{!allowed.includes(item) ? item === 'veil' ? ' · Gold' : ' · Silver' : ''}</button>)}</div>
    {message && <p role="status" className="text-sm text-indigo-900">{message}</p>}
  </section>;
}
