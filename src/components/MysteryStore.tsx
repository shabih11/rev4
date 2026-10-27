import { useEffect, useRef, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { gems, type Gem } from '../lib/gems';
import type { UserAccount } from '../lib/mockData';
import { StoreGem } from './StoreGem';
const amount = (n: number) => n.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
export function MysteryStore({ employee }: { employee: UserAccount }) {
  const { features, currentAccount } = useData();
  const magic = features?.store?.magic;
  const wallet = features?.store?.wallet;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState<Gem | null>(null);
  const request = useRef<{ id: string; price: number } | null>(null);
  const refresh = () => window.dispatchEvent(new Event('rev4-cache-changed'));
  if (currentAccount?.id !== employee.id || employee.role !== 'employee' || !magic || !wallet || (!magic.settings.boxes && !magic.settings.themes)) return null;
  async function equip(gem: Gem | null) {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('equip_gem', { requested: gem });
      if (error) throw error;
      refresh(); setMessage('تم تحديث مظهرك.');
    } catch { setMessage('تعذر تحديث المظهر. تحققي من الاتصال.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 space-y-5" aria-label="متجر الجواهر">
    <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-black">متجر الجواهر</h3><p className="font-bold text-teal-900">{amount(wallet.available)} <span className="text-xs">عملة</span></p></div>
    {magic.settings.boxes && <div className="rounded-2xl bg-violet-50 p-5 flex flex-wrap items-center gap-4"><Gift size={48} className="text-violet-800" aria-hidden="true"/><div className="flex-1"><h4 className="font-black text-lg text-violet-950">الصندوق السحري</h4><p className="mt-1 text-sm text-violet-900">جوهرة عشوائية · {amount(magic.settings.price)} رصيد</p></div><button className="action-primary" disabled={busy || wallet.available < magic.settings.price} onClick={() => { request.current ??= { id: crypto.randomUUID(), price: magic.settings.price }; setRevealed(null); setMessage(''); setConfirm(true); }}>فتح الصندوق</button></div>}
    {revealed && <div role="status" className="rounded-2xl bg-slate-50 p-5 text-center space-y-3"><StoreGem gem={revealed}/><p className="font-black text-lg">حصلتِ على {gems[revealed].name}</p></div>}
    {message && <p role="status" className="text-sm text-indigo-900">{message}</p>}
    {magic.owned.length > 0 && <div><h4 className="font-bold mb-3">جواهري</h4><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{magic.owned.map(item => <div key={item.gem} className="rounded-2xl border p-3 text-center space-y-2"><StoreGem gem={item.gem}/><p className="text-sm font-bold">{gems[item.gem].name}</p><p className="text-xs text-slate-600">×{item.count}</p>{magic.settings.themes && <button disabled={busy || magic.selected === item.gem} onClick={() => void equip(item.gem)} className="min-h-11 w-full text-sm font-bold text-indigo-900 disabled:text-slate-500">{magic.selected === item.gem ? 'المظهر الحالي' : 'اختيار المظهر'}</button>}</div>)}</div>{magic.settings.themes && <button disabled={busy || !magic.selected} onClick={() => void equip(null)} className="mt-3 min-h-11 text-sm font-bold text-slate-600 disabled:opacity-50">المظهر الافتراضي</button>}</div>}
    {confirm && request.current && <BoxDialog price={request.current.price} busy={busy} onClose={() => { if (!busy) setConfirm(false); }} onBuy={async () => {
      const purchase = request.current; if (busy || !purchase) return; setBusy(true); setMessage('');
      try {
        const { data, error } = await supabase.rpc('purchase_mystery_box', { request_id: purchase.id, expected_price: purchase.price });
        if (error) { if (error.code === '40001' || error.code === '22023' || error.code === '42501') request.current = null; throw error; }
        if (typeof data !== 'string' || !Object.hasOwn(gems, data)) throw new Error('Invalid response');
        setRevealed(data as Gem); request.current = null; setConfirm(false); refresh();
      } catch { setMessage('لم يتأكد فتح الصندوق. تحققي من الاتصال وأعيدي المحاولة.'); setConfirm(false); refresh(); }
      finally { setBusy(false); }
    }}/>}
  </section>;
}
function BoxDialog({ price, busy, onClose, onBuy }: { price: number; busy: boolean; onClose: () => void; onBuy: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} aria-labelledby="box-title" className="purchase-dialog rounded-3xl bg-white p-6 max-w-sm w-[calc(100%-2rem)] text-slate-900" dir="rtl"><div className="flex justify-between gap-4"><h3 id="box-title" className="font-black text-xl">فتح الصندوق السحري</h3><button autoFocus disabled={busy} onClick={onClose} aria-label="إغلاق" className="p-2"><X size={20}/></button></div><Gift size={64} className="mx-auto my-5 text-violet-800"/><p className="text-sm leading-7">السعر {amount(price)} رصيد. الجوهرة عشوائية وقد تتكرر.</p><button disabled={busy} onClick={() => void onBuy()} className="action-primary w-full mt-5">{busy ? 'جارٍ فتح الصندوق…' : 'تأكيد الشراء والفتح'}</button></dialog>;
}
