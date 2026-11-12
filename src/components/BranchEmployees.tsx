import { EmployeeIdentity } from './EmployeeIdentity';
import { belongsToBranch, isCoverageEmployee } from '../lib/employeeBranches';
import { EmployeeAvatar } from './EmployeeFeatures';
import { EmployeeAccountActions } from './EmployeeAccountActions';
import { EmployeeCard } from './EmployeeCard';
import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { invalidateRows, readNamespace } from '../lib/browserReadCache';
import { useData } from '../context/DataContext';

const field = 'w-full border border-slate-300 rounded-xl p-3 bg-white';

export function BranchEmployees({ branch }: { branch?: string }) {
  const { users, currentAccount, summaryReady } = useData();
  const [name, setName] = useState('');
  const registration = useRef<{ name: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function perform(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); }
    catch { setMessage('تعذر حفظ العملية. تحققي من الاتصال والصلاحيات ثم أعيدي المحاولة.'); }
    finally { setBusy(false); }
  }
  const employees = users.filter(item => item.role === 'employee');
  return <div className="space-y-5">
    {message && <p role="status" className="rounded-xl bg-blue-50 p-3 text-blue-900">{message}</p>}
    <>
      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="text-xl font-bold">الموظفات — {branch}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
          {employees.filter(item => belongsToBranch(item, branch || '')).map(item => <div key={item.id}><EmployeeCard employee={item}>
            <button type="button" className="w-full min-h-40 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col items-center justify-center gap-3 hover:border-indigo-400 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors" aria-label={`عرض بيانات ${item.name}`}>
              <EmployeeAvatar employee={item} className="h-16 w-16 rounded-full border-2 border-slate-100 bg-slate-50" />
              <EmployeeIdentity employee={item} className="items-center text-slate-800" />{isCoverageEmployee(item) && <span className="text-xs text-slate-500">موظفة متنقلة</span>}
              <span className="text-xs font-semibold text-blue-700">التقييمات: {summaryReady ? item.reviewsCount.toLocaleString('ar-SA-u-nu-latn') : '…'}</span>
            </button>
          </EmployeeCard><EmployeeAccountActions employee={item} /></div>)}
        </div>
        <form className="flex flex-col sm:flex-row sm:items-end gap-3 border-t border-slate-100 pt-4" onSubmit={event => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || !branch || currentAccount?.role !== 'manager' || currentAccount.branch !== branch) return;
          void perform(async () => {
            if (registration.current?.name !== trimmed) registration.current = { name: trimmed, id: crypto.randomUUID() };
            const { data, error } = await supabase.functions.invoke('employee-register', { body: { name: trimmed, requestId: registration.current.id } });
            if (!data?.success && !error) throw new Error('Registration unavailable');
            if (error) throw error;
            setName(''); registration.current = null;
            const { data: auth } = await supabase.auth.getSession();
            if (auth.session) await invalidateRows(readNamespace({ uid: auth.session.user.id, account: currentAccount }));
          }, 'تم تسجيل الموظفة في فرعك وإنشاء حساب دخول لها تلقائيًا.');
        }}>
          <label className="flex-1 min-w-40">اسم الموظفة<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} className={field} /></label>
          <button disabled={busy} className="action-primary shrink-0">إضافة موظفة</button>
        </form>
      </section>
      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="text-xl font-bold">الموظفات المتنقلات</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
          {employees.filter(isCoverageEmployee).map(item => <div key={item.id}><EmployeeCard employee={item}>
            <button type="button" className="w-full min-h-40 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col items-center justify-center gap-3 hover:border-indigo-400 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors" aria-label={`عرض بيانات ${item.name}`}>
              <EmployeeAvatar employee={item} className="h-16 w-16 rounded-full border-2 border-slate-100 bg-slate-50" />
              <EmployeeIdentity employee={item} className="items-center text-slate-800" />
              <span className="text-xs font-semibold text-blue-700">التقييمات: {summaryReady ? item.reviewsCount.toLocaleString('ar-SA-u-nu-latn') : '…'}</span>
            </button>
          </EmployeeCard><EmployeeAccountActions employee={item} /></div>)}
        </div>
      </section>
    </>
  </div>;
}
