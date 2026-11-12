import { useState } from 'react';
import { useData } from '../context/DataContext';
import { monthOf } from '../lib/avatarPrivileges';
import { supabase } from '../lib/supabase';

export function RewardMonthClosure() {
  const { currentAccount, resultsDate, avatarPrivileges, summaryReady, syncError } = useData();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (currentAccount?.role !== 'admin') return null;
  const period = monthOf(resultsDate);
  const closed = avatarPrivileges?.closures.some(closure => closure.period === period);
  async function close() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('close_reward_month', { requested_month: period });
      if (error) throw error;
      setMessage('أُغلقت مكافآت الشهر وثُبتت النتائج وأفتارات التتويج.');
      window.dispatchEvent(new Event('rev4-cache-changed'));
    } catch { setMessage('تعذر إغلاق المكافآت. حدّثي البيانات وتحققي من صلاحياتك وحالة الشهر.'); }
    finally { setBusy(false); setConfirm(false); }
  }
  return <section aria-label="إغلاق مكافآت الشهر" className="mx-auto max-w-xl space-y-2 rounded-xl border bg-white p-3 text-sm">
    {closed ? <p>مكافآت {period.slice(0, 7)} مغلقة والنتائج مثبتة.</p> : <button type="button" className="action-secondary" disabled={!avatarPrivileges || !summaryReady || Boolean(syncError) || busy || period >= monthOf(new Date())} onClick={() => setConfirm(true)}>إغلاق مكافآت الشهر</button>}
    {confirm && <div role="dialog" aria-modal="true" aria-label="تأكيد إغلاق المكافآت"><p>سيُغلق شهر {period.slice(0, 7)} نهائيًا، وتُحفظ المكافآت وأفتارات التتويج وتتوقف أدوات الإنقاذ وتعديلات سجلات الشهر. راجعي جميع الاستحقاقات قبل التأكيد.</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy} className="action-primary" onClick={() => void close()}>{busy ? 'جارٍ الإغلاق…' : 'تأكيد إغلاق المكافآت'}</button><button type="button" disabled={busy} className="action-secondary" onClick={() => setConfirm(false)}>إلغاء</button></div></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
