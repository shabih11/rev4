import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Gift, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { EmployeeWallet } from '../lib/employeeFeatures';
import { supabase } from '../lib/supabase';
import { RewardAmount, RewardIcon } from './RewardAmount';
import { simulationSnapshot, subscribeSimulation } from '../lib/simulationState';

export function CoinCollection() {
  const simulation = useSyncExternalStore(subscribeSimulation, simulationSnapshot);
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
    if (inFlight.current || !ready || simulation) return;
    inFlight.current = true;
    setBusy(id); setMessage(''); setFailed(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await supabase.rpc('collect_coin_achievement', { achievement_id: id })
        .abortSignal(controller.signal);
      if (error || !data || !Array.isArray(data.pendingAchievements) || typeof data.available !== 'number') throw error || new Error('invalid-wallet');
      if (!mounted.current) return;
      setCollected({ source, wallet: data as EmployeeWallet });
      setMessage('تم جمع المكافأة وتحديث رصيدك.');
      window.dispatchEvent(new Event('rev4-cache-changed'));
    } catch (reason) {
      if (!mounted.current) return;
      // A response can be lost after the transaction commits. Read the receipt
      // before presenting a failure; never infer or add coins on the client.
      const check = new AbortController();
      const checkTimeout = window.setTimeout(() => check.abort(), 15000);
      try {
        const { data, error } = await supabase.rpc('get_avatar_store').abortSignal(check.signal);
        const confirmed = data?.wallet as EmployeeWallet | undefined;
        if (!error && confirmed && typeof confirmed.available === 'number' && Array.isArray(confirmed.pendingAchievements)
          && !confirmed.pendingAchievements.some(item => item.id === id)) {
          if (mounted.current) {
            setCollected({ source, wallet: confirmed });
            setMessage('تم تحديث رصيدك.');
            window.dispatchEvent(new Event('rev4-cache-changed'));
          }
          return;
        }
      } catch { /* Keep the original failure if verification is unavailable. */ }
      finally { window.clearTimeout(checkTimeout); }
      if (!mounted.current) return;
      setFailed(true);
      const code = (reason as { code?: string })?.code;
      setMessage(code === '42501' || code === 'PGRST301'
        ? 'تعذر الجمع من الجلسة الحالية. سجّلي الدخول مجددًا بحساب الموظفة.'
        : 'تعذر تأكيد الجمع. حاولي مجددًا؛ لن تُجمع المكافأة مرتين.');
      window.dispatchEvent(new Event('rev4-cache-changed'));
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
      if (mounted.current) setBusy(undefined);
    }
  }

  return <>
    {ready && total > 0 && <div className="fixed bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] right-4 z-40 sm:right-6" aria-live="polite">
      <button ref={trigger} type="button" aria-label={`لديكِ عملات بانتظار الجمع: ${total.toLocaleString('en-US')} عملة`} aria-haspopup="dialog" onClick={() => { setMessage(''); dialog.current?.showModal(); }}
        className="flex min-h-16 min-w-16 flex-col items-center gap-1 rounded-2xl p-2 text-[#142b54] drop-shadow-[0_2px_3px_#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <Gift className="size-10 text-[#35557b]" strokeWidth={1.8} aria-hidden="true" />
        <span className="text-sm font-black"><RewardAmount kind="coins" value={total} /></span>
      </button>
    </div>}
    <dialog ref={dialog} dir="rtl" aria-labelledby={titleId} onClose={() => trigger.current?.focus()}
      className="glass-modal-shell m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
      <header className="glass-modal-header sticky top-0 z-10 flex items-center justify-between gap-3 p-4 sm:p-6">
        <h2 id={titleId} className="flex items-center gap-2 text-xl font-black"><RewardIcon kind="coins" />الإنجازات والمكافآت</h2>
        <button type="button" aria-label="إغلاق الإنجازات" onClick={() => dialog.current?.close()} className="glass-modal-control grid size-11 shrink-0 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-blue-600"><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="p-4 sm:p-6">
      {wallet && <p className="mt-3 text-sm font-bold">رصيدك المتاح: <RewardAmount kind="coins" value={wallet.available} /></p>}
      {simulation && <p role="status" className="mt-3 text-sm text-slate-600">المحاكاة للعرض فقط؛ جمع المكافآت متاح من حساب الموظفة.</p>}
      {!ready && <p role="alert" className="mt-3 text-sm text-red-700">تعذر التحقق من المكافآت. انتظري عودة المزامنة قبل الجمع.</p>}
      {message && <p role={failed ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-sm ${failed ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      {pending.length > 0 ? <ul className="mt-4 divide-y divide-slate-100">{pending.map(item => <li key={item.id} className="flex items-center gap-3 py-4">
        <div className="min-w-0 flex-1"><h3 className="break-words font-bold">{item.title}</h3></div>
        <button type="button" aria-label={`جمع مكافأة ${item.title}`} aria-busy={busy === item.id} disabled={Boolean(busy) || !ready || Boolean(simulation)} onClick={() => void collect(item.id)}
          className="min-h-11 min-w-20 shrink-0 rounded-xl bg-[#e8f0f8] px-4 py-2 text-sm font-black text-[#142b54] hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50"><RewardAmount kind="coins" value={item.coins} /></button>
      </li>)}</ul> : <p className="py-8 text-center font-bold text-slate-600">لا توجد عملات بانتظار الجمع.</p>}
      </div>
    </dialog>
  </>;
}
