import { EmployeeTransfer } from './EmployeeTransfer';
import { useEffect, useId, useRef, useState } from 'react';
import { GitMerge, UserRoundMinus } from 'lucide-react';
import { MergeAccountPicker } from './MergeAccountPicker';
import { useData } from '../context/DataContext';
import { isCoverageEmployee, employeeSelectionBranch } from '../lib/employeeBranches';
import type { UserAccount } from '../lib/mockData';

export function EmployeeManagementActions({ employee, onComplete }: { employee?: UserAccount; onComplete?: () => void }) {
  const { currentAccount, users, setEmployeeDisabled, mergeEmployees, summaryReady } = useData();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [action, setAction] = useState<'disable' | 'merge' | null>(null);
  const [primaryId, setPrimaryId] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [primaryBranch, setPrimaryBranch] = useState('');
  const [duplicateBranch, setDuplicateBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const employees = users.filter(user => user.role === 'employee');
  const primary = employees.find(user => user.id === primaryId && employeeSelectionBranch(user) === primaryBranch);
  const duplicate = employees.find(user => user.id === duplicateId && employeeSelectionBranch(user) === duplicateBranch);
  const authorized = currentAccount?.role === 'admin';
  useEffect(() => {
    if (action && authorized) dialog.current?.showModal();
    else dialog.current?.close();
  }, [action, authorized]);
  if (!authorized || (employee && employee.role !== 'employee')) return null;
  function open(next: 'disable' | 'merge') {
    setPrimaryBranch(employeeSelectionBranch(employee)); setDuplicateBranch('');
    setPrimaryId(employee?.id || ''); setDuplicateId(''); setError(''); setMessage(''); setAction(next);
  }
  return <div className="space-y-2" onClick={event => event.stopPropagation()}>
    {employee && <EmployeeTransfer employee={employee} />}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-800" onClick={() => open('merge')}><GitMerge size={16} aria-hidden="true" />{employee ? 'دمج الموظفة' : 'دمج موظفتين'}</button>
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800" onClick={() => open('disable')}><UserRoundMinus size={16} aria-hidden="true" />تعطيل الموظفة</button>
    </div>
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    <dialog ref={dialog} aria-labelledby={heading} className="m-auto max-h-[90dvh] w-[min(94vw,32rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/50" dir="rtl"
      onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setAction(null)}>
      <form className="space-y-5" onSubmit={async event => {
        event.preventDefault();
        if (busy || !primary || !summaryReady || (action === 'merge' && (!duplicate || duplicate.id === primary.id))) return;
        setBusy(true); setError('');
        try {
          const ok = action === 'disable' ? await setEmployeeDisabled(primary.id, true) : await mergeEmployees(primary.id, duplicate!.id, primary.name, primary.branch, isCoverageEmployee(primary));
          if (!ok) { setError(action === 'disable' ? 'تعذر التعطيل. تحققي من الاتصال والصلاحيات وتطبيق تحديث قاعدة البيانات.' : 'تعذر الدمج. تحققي من الاتصال والصلاحيات ثم أعيدي المحاولة.'); return; }
          setMessage(action === 'disable' ? 'تم تعطيل الموظفة ونقلها إلى قائمة المعطّلات.' : 'تم دمج الموظفتين بنجاح.');
          setAction(null); onComplete?.();
        } catch { setError('تعذر إتمام العملية. تحققي من الاتصال ثم أعيدي المحاولة.'); }
        finally { setBusy(false); }
      }}>
        <h2 id={heading} className="text-xl font-bold">{action === 'disable' ? 'تعطيل الموظفة' : 'دمج حسابي موظفتين'}</h2>
        <p className="text-sm text-slate-600">{action === 'disable' ? 'ستختفي الموظفة من واجهات النظام ويتوقف دخول حسابها، مع الاحتفاظ بتقييماتها وشفتاتها. يمكنك إعادة تفعيلها من قائمة المعطّلات في تبويب الموظفات.' : 'اختاري الحساب الأساسي الذي سيبقى، ثم الحساب المكرر. ستُنقل التقييمات والشفتات والأرصدة إلى الحساب الأساسي.'}</p>
        <fieldset disabled={busy || !summaryReady} className="space-y-4">
          <legend className="sr-only">اختيار الفرع ثم الموظفة</legend>
          <MergeAccountPicker label={action === 'disable' ? 'الموظفة المراد تعطيلها' : 'الحساب الأساسي الذي سيبقى'}
            branch={primaryBranch} onBranchChange={branch => { setPrimaryBranch(branch); setPrimaryId(''); setError(''); }}
            value={primaryId} onChange={id => { setPrimaryId(id); if (duplicateId === id) setDuplicateId(''); setError(''); }} users={users} ready={summaryReady} />
          {action === 'merge' && <MergeAccountPicker label="الحساب المكرر الذي سيُدمج"
            branch={duplicateBranch} onBranchChange={branch => { setDuplicateBranch(branch); setDuplicateId(''); setError(''); }}
            value={duplicateId} onChange={id => { setDuplicateId(id); setError(''); }} excludedId={primaryId} users={users} ready={summaryReady} />}
        </fieldset>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || !summaryReady || !primary || (action === 'merge' && !duplicate)} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التنفيذ…' : action === 'disable' ? 'تأكيد التعطيل' : 'تأكيد الدمج'}</button>
          <button type="button" disabled={busy} className="min-h-12 rounded-xl border px-5 py-3" onClick={() => setAction(null)}>إلغاء</button>
        </div>
      </form>
    </dialog>
  </div>;
}
