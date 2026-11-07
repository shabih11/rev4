import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type { UserAccount } from '../lib/mockData';
import { employeeBranchLabel, employeeSelectionBranch } from '../lib/employeeBranches';
import { useData } from '../context/DataContext';

export function EmployeeTransfer({ employee }: { employee: UserAccount }) {
  const { currentAccount, branchSettings, summaryReady, transferEmployee } = useData();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const authorized = currentAccount?.role === 'admin';
  useEffect(() => {
    if (open && authorized) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open, authorized]);
  if (!authorized || employee.role !== 'employee') return null;
  return <div onClick={event => event.stopPropagation()} className="space-y-2">
    <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-900" onClick={() => {
      setTarget(employeeSelectionBranch(employee)); setError(''); setMessage(''); setOpen(true);
    }}><ArrowRightLeft size={16} aria-hidden="true" />نقل الموظفة</button>
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    <dialog ref={dialog} aria-labelledby={heading} dir="rtl" className="m-auto w-[min(94vw,30rem)] rounded-2xl border bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/50"
      onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setOpen(false)}>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (busy || !summaryReady || !target || target === employeeSelectionBranch(employee)) return;
        setBusy(true); setError('');
        try {
          const ok = await transferEmployee(employee.id, target);
          if (!ok) { setError('تعذر النقل. حدّثي البيانات وتحققي من الاتصال والصلاحيات.'); return; }
          setMessage('تم نقل الموظفة وحفظ فرعها الجديد.'); setOpen(false);
        } catch { setError('تعذر النقل؛ أعيدي المحاولة.'); }
        finally { setBusy(false); }
      }}>
        <h2 id={heading} className="text-xl font-bold">نقل الموظفة — {employee.name}</h2>
        <p className="text-sm text-slate-600">الحالة الحالية: {employeeBranchLabel(employee)}. تبقى الشفتات والتقييمات السابقة محفوظة.</p>
        <label className="block font-bold">الفرع الجديد أو موظفة متنقلة
          <select value={target} disabled={busy} onChange={event => setTarget(event.target.value)} className="mt-2 w-full rounded-xl border p-3">
            {Object.keys(branchSettings).map(branch => <option key={branch} value={branch}>{branch}</option>)}
            <option value="موظفة خارجية">موظفة متنقلة</option>
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-3">
          <button disabled={busy || !summaryReady || !target || target === employeeSelectionBranch(employee)} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ النقل…' : 'حفظ النقل'}</button>
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 rounded-xl border px-4 py-2">إلغاء</button>
        </div>
      </form>
    </dialog>
  </div>;
}
