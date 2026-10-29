import { EmployeeIdentity } from './EmployeeIdentity';
import { belongsToBranch, isCoverageEmployee } from '../lib/employeeBranches';
import { EmployeeAvatar } from './EmployeeFeatures';
import { EmployeeAccountActions } from './EmployeeAccountActions';
import { EmployeeCard } from './EmployeeCard';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { invalidateRows, readNamespace } from '../lib/browserReadCache';
import { useData } from '../context/DataContext';

interface MergeRequest {
  id: string; branch: string; primaryId: string; duplicateId: string;
  name: string; targetBranch: string; isCoverage: boolean; status: 'pending' | 'reviewed' | 'rejected';
}
const field = 'w-full border border-slate-300 rounded-xl p-3 bg-white';

export function BranchEmployees({ branch, onReview }: { branch?: string; onReview?: (request: MergeRequest) => void }) {
  const { users, currentAccount, summaryReady } = useData();
  const [requests, setRequests] = useState<MergeRequest[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [readError, setReadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const accountId = currentAccount?.id;
  const isAdmin = currentAccount?.role === 'admin';
  useEffect(() => {
    if (!accountId || !isAdmin) return;
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from('employee_merge_requests').select('*');
      if (!active) return;
      if (error) { setRequests([]); setReadError(true); return; }
      setRequests((data || []).map(row => ({ id: row.id, branch: row.branch, primaryId: row.primary_id, duplicateId: row.duplicate_id, name: row.name, targetBranch: row.target_branch, isCoverage: row.is_coverage, status: row.status })));
      setReadError(false);
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isAdmin, accountId, revision]);

  async function perform(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); setRevision(value => value + 1); setMessage(success); }
    catch { setMessage('تعذر حفظ العملية. تحققي من الاتصال والصلاحيات ثم أعيدي المحاولة.'); }
    finally { setBusy(false); }
  }
  const employees = users.filter(item => item.role === 'employee');
  return <div className="space-y-5">
    {message && <p role="status" className="rounded-xl bg-blue-50 p-3 text-blue-900">{message}</p>}
    {!isAdmin && <>
      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="text-xl font-bold">الموظفات — {branch}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
          {employees.filter(item => belongsToBranch(item, branch || '')).map(item => <div key={item.id}><EmployeeCard employee={item}>
            <button type="button" className="w-full min-h-40 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col items-center justify-center gap-3 hover:border-indigo-400 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors" aria-label={`عرض بيانات ${item.name}`}>
              <EmployeeAvatar employee={item} className="h-16 w-16 rounded-full border-2 border-slate-100 bg-slate-50" />
              <EmployeeIdentity employee={item} className="items-center text-slate-800" />{isCoverageEmployee(item) && <span className="text-xs text-slate-500">تغطية</span>}
              <span className="text-xs font-semibold text-blue-700">التقييمات: {summaryReady ? item.reviewsCount.toLocaleString('ar-SA-u-nu-latn') : '…'}</span>
            </button>
          </EmployeeCard><EmployeeAccountActions employee={item} /></div>)}
        </div>
        <form className="flex flex-col sm:flex-row sm:items-end gap-3 border-t border-slate-100 pt-4" onSubmit={event => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || !branch || currentAccount?.role !== 'manager' || currentAccount.branch !== branch) return;
          void perform(async () => {
            const { error } = await supabase.rpc('register_branch_employee', { employee_name: trimmed, requested_branch: branch });
            if (error) throw error;
            setName('');
            const { data: auth } = await supabase.auth.getSession();
            if (auth.session) await invalidateRows(readNamespace({ uid: auth.session.user.id, account: currentAccount }));
          }, 'تمت إضافة سجل الموظفة. تهيئة حساب الدخول من اختصاص الإدارة العامة.');
        }}>
          <label className="flex-1 min-w-40">اسم الموظفة<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} className={field} /></label>
          <button disabled={busy} className="action-primary shrink-0">إضافة موظفة</button>
        </form>
      </section>
      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="text-xl font-bold">موظفات التغطية</h2>
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
    </>}
    {isAdmin && <section className="bg-white border rounded-3xl p-5 space-y-3">
      <h2 className="font-bold text-xl">طلبات دمج الموظفات</h2>
      {readError ? <p role="alert">تعذر تحميل الطلبات. تحققي من الاتصال وتفعيل قواعد الصلاحيات.</p> : requests.length === 0 ? <p>لا توجد طلبات دمج.</p> : requests.map(request => <div key={request.id} className="border rounded-xl p-3 space-y-2">
        <p>{users.find(item => item.id === request.primaryId)?.name || request.name} + {users.find(item => item.id === request.duplicateId)?.name || 'الحساب المكرر'} — {request.isCoverage ? 'تغطية' : request.targetBranch}</p>
        <p>{request.status === 'pending' ? 'بانتظار الإدارة' : request.status === 'reviewed' ? 'تمت المراجعة' : 'مرفوض'}</p>
        {isAdmin && request.status === 'pending' && <div className="flex flex-col sm:flex-row sm:items-end gap-3 border-t border-slate-100 pt-4">
          <button className="text-blue-700" onClick={() => onReview?.(request)}>مراجعة وتنفيذ الدمج</button>
          <button disabled={busy || users.some(item => item.id === request.duplicateId) || !users.some(item => item.id === request.primaryId && item.branch === request.targetBranch && isCoverageEmployee(item) === request.isCoverage)} onClick={() => void perform(async () => { const { error } = await supabase.from('employee_merge_requests').update({ status: 'reviewed' }).eq('id', request.id); if (error) throw error; }, 'تم إغلاق الطلب.')} className="text-emerald-700 disabled:opacity-40">إغلاق بعد تنفيذ الدمج</button>
          <button disabled={busy} onClick={() => void perform(async () => { const { error } = await supabase.from('employee_merge_requests').update({ status: 'rejected' }).eq('id', request.id); if (error) throw error; }, 'تم رفض الطلب.')} className="text-red-700">رفض الطلب</button>
        </div>}
      </div>)}
    </section>}
  </div>;
}
