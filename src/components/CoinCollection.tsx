import { useEffect, useId, useRef, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { EmployeeWallet } from '../lib/employeeFeatures';
import { supabase } from '../lib/supabase';
import { RewardAmount, RewardIcon } from './RewardAmount';

export function CoinCollection() {
  const { features, summaryReady, syncError, currentAccount } = useData();
  const source = features?.store?.wallet;
  const [collected, setCollected] = useState<{ source: typeof source; wallet: EmployeeWallet }>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const titleId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const wallet = collected && collected.source === source ? collected.wallet : source;
  const pending = wallet?.pendingAchievements ?? [];
  const total = pending.reduce((sum, item) => sum + item.coins, 0);
  const ready = currentAccount?.role === 'employee' && summaryReady && !syncError && Boolean(wallet);

  async function collect(id: string) {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setBusy(id); setMessage(''); setFailed(false);
    try {
      const { data, error } = await supabase.rpc('collect_coin_achievement', { achievement_id: id })
        .abortSignal(AbortSignal.timeout(15000));
      if (error || !data || !Array.isArray(data.pendingAchievements) || typeof data.available !== 'number') throw error || new Error('invalid-wallet');
      if (!mounted.current) return;
      setCollected({ source, wallet: data as EmployeeWallet });
      setMessage('تم جمع المكافأة وتحديث رصيدك.');
      window.dispatchEvent(new Event('rev4-cache-changed'));
    } catch {
      if (!mounted.current) return;
      setFailed(true);
      setMessage('تعذر تأكيد الجمع. حاولي مجددًا؛ لن تُجمع المكافأة مرتين.');
      window.dispatchEvent(new Event('rev4-cache-changed'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(undefined);
    }
  }

  return <>
    {ready && total > 0 && <div className="px-4 py-3 sm:px-6" aria-live="polite">
      <button ref={trigger} type="button" aria-haspopup="dialog" onClick={() => { setMessage(''); dialog.current?.showModal(); }}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-start text-amber-950 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
        <Gift className="shrink-0 text-amber-700" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block font-black">لديكِ عملات بانتظار الجمع</span><span className="mt-1 block text-xs">افتحي الإنجازات واجمعي مكافآتكِ</span></span>
        <span className="shrink-0 font-black"><RewardAmount kind="coins" value={total} /></span>
      </button>
    </div>}
    <dialog ref={dialog} dir="rtl" aria-labelledby={titleId} onClose={() => trigger.current?.focus()}
      className="m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="flex items-center gap-2 text-xl font-black"><RewardIcon kind="coins" />الإنجازات والمكافآت</h2>
        <button type="button" aria-label="إغلاق الإنجازات" onClick={() => dialog.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600"><X size={20} aria-hidden="true" /></button>
      </header>
      <p className="mt-3 text-sm leading-6 text-slate-600">اضغطي «جمع» لإضافة عملات الإنجاز إلى رصيدك المتاح للشراء.</p>
      {wallet && <p className="mt-3 text-sm font-bold">رصيدك المتاح: <RewardAmount kind="coins" value={wallet.available} /></p>}
      {!ready && <p role="alert" className="mt-3 text-sm text-red-700">تعذر التحقق من المكافآت. انتظري عودة المزامنة قبل الجمع.</p>}
      {message && <p role={failed ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-sm ${failed ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      {pending.length > 0 ? <ul className="mt-4 divide-y divide-slate-100">{pending.map(item => <li key={item.id} className="flex items-center gap-3 py-4">
        <div className="min-w-0 flex-1"><h3 className="break-words font-bold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.period}</p><p className="mt-2 font-bold text-amber-800"><RewardAmount kind="coins" value={item.coins} /></p></div>
        <button type="button" aria-label={`جمع مكافأة ${item.title}`} disabled={Boolean(busy) || !ready} onClick={() => void collect(item.id)}
          className="min-h-11 min-w-20 shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-amber-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700 disabled:opacity-50">{busy === item.id ? 'جارٍ الجمع…' : 'جمع'}</button>
      </li>)}</ul> : <p className="py-8 text-center font-bold text-slate-600">لا توجد عملات بانتظار الجمع.</p>}
    </dialog>
  </>;
}
