import { useEffect, useId, useRef, useState } from 'react';
import { GitMerge, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { isCoverageEmployee } from '../lib/employeeBranches';
import type { UserAccount } from '../lib/mockData';

export function EmployeeManagementActions({ employee, onComplete }: { employee?: UserAccount; onComplete?: () => void }) {
  const { currentAccount, users, removeUser, mergeEmployees, summaryReady } = useData();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [action, setAction] = useState<'delete' | 'merge' | null>(null);
  const [primaryId, setPrimaryId] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const employees = users.filter(user => user.role === 'employee');
  const primary = employees.find(user => user.id === primaryId);
  const duplicate = employees.find(user => user.id === duplicateId);
  const authorized = currentAccount?.role === 'admin';
  useEffect(() => {
    if (action && authorized) dialog.current?.showModal();
    else dialog.current?.close();
  }, [action, authorized]);
  if (!authorized || (employee && employee.role !== 'employee')) return null;
  function open(next: 'delete' | 'merge') {
    setPrimaryId(employee?.id || ''); setDuplicateId(''); setError(''); setMessage(''); setAction(next);
  }
  const selectClass = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
  return <div className="space-y-2" onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-800" onClick={() => open('merge')}><GitMerge size={16} aria-hidden="true" />{employee ? 'دمج الموظفة' : 'دمج موظفتين'}</button>
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800" onClick={() => open('delete')}><Trash2 size={16} aria-hidden="true" />حذف موظفة</button>
    </div>
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    <dialog ref={dialog} aria-labelledby={heading} className="m-auto max-h-[90dvh] w-[min(94vw,32rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/50" dir="rtl"
      onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setAction(null)}>
      <form className="space-y-5" onSubmit={async event => {
        event.preventDefault();
        if (busy || !primary || !summaryReady || (action === 'merge' && (!duplicate || duplicate.id === primary.id))) return;
        setBusy(true); setError('');
        try {
          const ok = action === 'delete' ? await removeUser(primary.id) : await mergeEmployees(primary.id, duplicate!.id, primary.name, primary.branch, isCoverageEmployee(primary));
          if (!ok) { setError(action === 'delete' ? 'تعذر الحذف. قد تكون الموظفة مرتبطة بتقييمات أو شفتات؛ استخدمي الدمج لحفظ سجلاتها، أو تحققي من الاتصال والصلاحيات.' : 'تعذر الدمج. تحققي من الاتصال والصلاحيات ثم أعيدي المحاولة.'); return; }
          setMessage(action === 'delete' ? 'تم حذف سجل الموظفة.' : 'تم دمج الموظفتين بنجاح.');
          setAction(null); onComplete?.();
        } catch { setError('تعذر إتمام العملية. تحققي من الاتصال ثم أعيدي المحاولة.'); }
        finally { setBusy(false); }
      }}>
        <h2 id={heading} className="text-xl font-bold">{action === 'delete' ? 'حذف سجل موظفة' : 'دمج حسابي موظفتين'}</h2>
        <p className="text-sm text-slate-600">{action === 'delete' ? 'الحذف متاح للسجلات غير المرتبطة بتقييمات أو شفتات. إذا كانت الموظفة مكررة، استخدمي الدمج للاحتفاظ بسجلاتها.' : 'اختاري الحساب الأساسي الذي سيبقى، ثم الحساب المكرر. ستُنقل التقييمات والشفتات والأرصدة إلى الحساب الأساسي.'}</p>
        <label className="block text-sm font-bold">{action === 'delete' ? 'الموظفة المراد حذفها' : 'الحساب الأساسي الذي سيبقى'}
          <select required disabled={busy || !summaryReady} value={primaryId} onChange={event => { setPrimaryId(event.target.value); if (duplicateId === event.target.value) setDuplicateId(''); }} className={selectClass}>
            <option value="">اختاري موظفة</option>{employees.map(user => <option key={user.id} value={user.id}>{user.name} — {user.branch}</option>)}
          </select>
        </label>
        {action === 'merge' && <label className="block text-sm font-bold">الحساب المكرر الذي سيُدمج
          <select required disabled={busy || !summaryReady} value={duplicateId} onChange={event => setDuplicateId(event.target.value)} className={selectClass}>
            <option value="">اختاري الحساب المكرر</option>{employees.filter(user => user.id !== primaryId).map(user => <option key={user.id} value={user.id}>{user.name} — {user.branch}</option>)}
          </select>
        </label>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || !summaryReady || !primary || (action === 'merge' && !duplicate)} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التنفيذ…' : action === 'delete' ? 'تأكيد الحذف' : 'تأكيد الدمج'}</button>
          <button type="button" disabled={busy} className="min-h-12 rounded-xl border px-5 py-3" onClick={() => setAction(null)}>إلغاء</button>
        </div>
      </form>
    </dialog>
  </div>;
}
