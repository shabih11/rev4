import { useState } from 'react';
import { useData } from '../context/DataContext';

export function DisabledEmployees() {
  const { currentAccount, disabledEmployees, setEmployeeDisabled, summaryReady } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  if (currentAccount?.role !== 'admin') return null;
  return <details className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <summary className="min-h-11 cursor-pointer font-bold text-slate-800">الموظفات المعطّلات ({disabledEmployees.length.toLocaleString('ar-SA')})</summary>
    <p className="my-3 text-sm text-slate-600">تُحفظ سجلات الموظفة أثناء التعطيل، ويمكن إعادتها إلى النظام من هنا.</p>
    {message && <p role="status" className="my-3 text-sm">{message}</p>}
    {!summaryReady ? <p role="status">جارٍ تحميل القائمة…</p> : disabledEmployees.length === 0 ? <p className="text-sm text-slate-600">لا توجد موظفات معطّلات.</p> : <ul className="space-y-2">
      {disabledEmployees.map(employee => <li key={employee.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3">
        <div><strong>{employee.name}</strong><p className="text-sm text-slate-600">{employee.branch}</p></div>
        <button type="button" disabled={busy !== null} className="min-h-11 rounded-xl border border-blue-200 px-4 py-2 font-bold text-blue-800 disabled:opacity-50" onClick={async () => {
          if (busy || !window.confirm('إعادة تفعيل الموظفة وإظهارها في النظام؟')) return;
          setBusy(employee.id); setMessage('');
          try {
            const ok = await setEmployeeDisabled(employee.id, false);
            setMessage(ok ? 'تمت إعادة تفعيل الموظفة.' : 'تعذرت إعادة التفعيل. تحققي من الاتصال والصلاحيات وتحديث قاعدة البيانات.');
          } finally { setBusy(null); }
        }}>{busy === employee.id ? 'جارٍ التنفيذ…' : 'إعادة التفعيل'}</button>
      </li>)}
    </ul>}
  </details>;
}
