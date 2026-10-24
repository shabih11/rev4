import { useState } from 'react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import type { UserAccount } from '../lib/mockData';
export function EmployeeAccountActions({ employee }: { employee: UserAccount }) {
  const { currentAccount } = useData();
  const [action, setAction] = useState<'email' | 'reset' | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!currentAccount || !['admin', 'manager'].includes(currentAccount.role)) return null;
  return <div className="mt-3 space-y-2 text-sm" onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-blue-200 px-3 py-2 text-blue-800 bg-blue-50 font-bold" onClick={() => { setAction('email'); setMessage(''); }}>تغيير البريد</button><button type="button" className="rounded-lg border border-amber-200 px-3 py-2 text-amber-900 bg-amber-50 font-bold" onClick={() => { setAction('reset'); setMessage(''); }}>استعادة كلمة السر</button></div>
    {action && <form className="space-y-2 rounded-xl border bg-white p-3" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setMessage('');
      const { error } = await supabase.functions.invoke('employee-account', { body: { profileId: employee.id, action, ...(action === 'email' ? { email: email.trim() } : {}) } });
      setBusy(false);
      setMessage(error ? 'تعذرت العملية. تحققي من الصلاحيات وإعداد خدمة الحسابات أو تواصلي مع الإدارة.' : action === 'reset' ? 'تمت استعادة كلمة السر الافتراضية.' : 'تم تحديث بريد الدخول.');
      if (!error) { setAction(null); setEmail(''); window.dispatchEvent(new Event('rev4-cache-changed')); }
    }}>
      <p className="font-bold text-slate-900">{action === 'email' ? `تغيير بريد دخول ${employee.name}` : `استعادة كلمة السر الافتراضية لحساب ${employee.name}؟`}</p>
      {action === 'email' && <label className="block text-slate-700">البريد الجديد<input required type="email" maxLength={254} autoComplete="off" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-lg border p-2 mt-1" /></label>}
      <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-blue-700 text-white px-3 py-2 disabled:opacity-50">{busy ? 'جارٍ التنفيذ…' : 'تأكيد'}</button><button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => setAction(null)}>إلغاء</button></div>
    </form>}
    {message && <p role="status" className="text-slate-800">{message}</p>}
  </div>;
}
