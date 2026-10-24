import { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Check, LockKeyhole, Wallet } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import type { UserAccount } from '../lib/mockData';
import type { AvatarCollection, AvatarVariant } from '../lib/employeeFeatures';
import { AvatarImage } from './AvatarImage';
import { EmployeeAvatar } from './EmployeeFeatures';
const amount = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
export function AvatarStore({ employee }: { employee: UserAccount }) {
  const { features, currentAccount } = useData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<{ collection: AvatarCollection; variant: AvatarVariant } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!features?.settings.avatars || employee.role !== 'employee' || currentAccount?.id !== employee.id) return null;
  const store = features.store;
  if (!store || !store.wallet) return <section className="rounded-2xl border bg-white p-6"><h3 className="font-bold">متجر الأفاتار</h3><p role="status" className="mt-2 text-sm text-slate-600">المتجر غير متاح حاليًا. تحققي من الاتصال.</p></section>;
  const wallet = store.wallet;
  async function equip(variant: string | null) {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('equip_avatar', { variant });
      if (error) throw error;
      window.dispatchEvent(new Event('rev4-cache-changed')); setMessage('تم تحديث الأفاتار.');
    } catch { setMessage('تعذر اختيار الأفاتار. تحققي من الاتصال وملكية الشكل.'); }
    finally { setBusy(false); }
  }
  return <section className="avatar-shop rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 space-y-6">
    <div className="flex items-center gap-4"><EmployeeAvatar employee={employee} className="h-28 w-20 shrink-0"/><div><h3 className="text-2xl font-black text-slate-900 mt-1">متجر الأفاتار</h3></div></div>
    <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 font-bold text-teal-950"><Wallet size={18}/>رصيد المتجر</p><p className="text-2xl font-black text-teal-900">{amount(wallet.available)} <span className="text-xs">رصيد</span></p></div></div>
    <button type="button" disabled={busy || !store.selectedVariant} onClick={() => void equip(null)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-50">استخدام الأفاتار الافتراضي</button>
    {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}
    {store.collections.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-slate-600">لا توجد أفاتارات متاحة حاليًا.</p>}
    <div className="space-y-4">{store.collections.map(collection => <article key={collection.id} className="rounded-2xl border border-slate-200 overflow-hidden">
      <button type="button" aria-expanded={expanded === collection.id} aria-controls={`avatar-group-${collection.id}`} onClick={() => setExpanded(expanded === collection.id ? null : collection.id)} className="w-full text-right p-4 flex items-center gap-4 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600">
        <AvatarImage path={collection.variants[0]?.imagePath || null} alt="" className="h-24 w-16 object-contain shrink-0"/><span className="flex-1 min-w-0"><span className="block font-bold text-lg text-slate-900 break-words">{collection.name}</span><span className="block mt-2 text-sm text-slate-600">{collection.variants.filter(variant => !variant.ownerId && variant.enabled && collection.enabled).length} أشكال متاحة</span><span className="block mt-2 text-xs text-teal-800 font-bold">{expanded === collection.id ? 'إخفاء الأشكال −' : 'استكشاف الأشكال +'}</span></span><span className="text-center shrink-0 text-teal-900 font-black">{amount(collection.price)}<span className="block text-xs font-normal mt-1">رصيد / شكل</span></span>
      </button>
      {expanded === collection.id && <div id={`avatar-group-${collection.id}`} className="border-t bg-slate-50 p-4 grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
        {collection.variants.length === 0 && <p className="text-sm text-slate-600 col-span-full">ستُضاف أشكال هذه المجموعة قريبًا.</p>}
        {collection.variants.map(variant => {
          const owned = variant.ownerId === employee.id;
          const selected = store.selectedVariant === variant.id;
          const unavailable = Boolean(variant.ownerId) || !variant.enabled || !collection.enabled;
          return <div key={variant.id} className={`rounded-2xl border p-3 bg-white space-y-3 ${selected ? 'border-teal-500 ring-1 ring-teal-300' : 'border-slate-200'}`}>
            <div className="shop-art-stage"><AvatarImage path={variant.imagePath} alt={variant.name} className="h-40 w-full object-contain relative z-10"/><span className="shop-art-plinth"/></div>
            <h4 className="text-sm font-bold text-slate-900 break-words">{variant.name}</h4>
            {variant.ownerId ? <p className="text-xs text-purple-900 flex gap-1 items-start"><LockKeyhole size={13} className="shrink-0"/>حصرية لـ {variant.ownerName || 'مالكتها'}</p> : <p className="text-xs text-slate-600">{unavailable ? 'غير معروض للبيع' : 'نسخة واحدة متاحة'}</p>}
            {owned ? <button type="button" disabled={busy || selected} onClick={() => void equip(variant.id)} className="w-full rounded-xl border border-teal-300 bg-teal-50 px-2 py-3 text-xs font-bold text-teal-900 disabled:opacity-60">{selected ? <span className="inline-flex items-center gap-1"><Check size={14}/>الأفاتار الحالي</span> : 'استخدام هذا الشكل'}</button> : <button type="button" disabled={busy || unavailable || wallet.available < collection.price} onClick={() => setPending({ collection, variant })} className="w-full rounded-xl bg-slate-900 text-white px-2 py-3 text-xs font-bold disabled:bg-slate-100 disabled:text-slate-500">{unavailable ? 'محجوز' : wallet.available < collection.price ? 'الرصيد غير كافٍ' : `اقتناء بـ ${amount(collection.price)}`}</button>}
          </div>;
        })}
      </div>}
    </article>)}</div>
    {pending && <PurchaseDialog item={pending} balance={wallet.available} busy={busy} onCancel={() => { if (!busy) setPending(null); }} onConfirm={async () => {
      if (busy) return; setBusy(true); setMessage('');
      try {
        const { error } = await supabase.rpc('purchase_avatar', { variant: pending.variant.id, expected_price: pending.collection.price });
        if (error) throw error;
        setPending(null); setMessage('أصبح هذا الشكل ملكك وحدك، وتم اختياره كأفاتارك الحالي.'); window.dispatchEvent(new Event('rev4-cache-changed'));
      } catch { setPending(null); setMessage('لم تكتمل عملية الشراء. قد يكون الشكل قد بيع أو تغير السعر أو الرصيد؛ حدّثي المتجر وأعيدي المحاولة.'); window.dispatchEvent(new Event('rev4-cache-changed')); }
      finally { setBusy(false); }
    }}/>}
  </section>;
}
function PurchaseDialog({ item, balance, busy, onCancel, onConfirm }: { item: { collection: AvatarCollection; variant: AvatarVariant }; balance: number; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onCancel(); }} onClose={onCancel} aria-labelledby="avatar-purchase-title" className="purchase-dialog rounded-3xl bg-white p-6 max-w-sm w-[calc(100%-2rem)] text-slate-900" dir="rtl">
    <AvatarImage path={item.variant.imagePath} alt={item.variant.name} className="h-44 w-full object-contain"/><h3 id="avatar-purchase-title" className="text-xl font-black mt-4">اقتناء {item.variant.name}</h3><p className="text-sm mt-3 leading-7 text-slate-600">سيُخصم {amount(item.collection.price)} من رصيد المتجر. الرصيد بعد الشراء: {amount(Math.max(0, balance - item.collection.price))}.</p>
    <div className="flex gap-3 mt-5"><button type="button" disabled={busy} onClick={() => void onConfirm()} className="action-primary flex-1"><ShoppingBag size={16}/>{busy ? 'جارٍ الاقتناء…' : 'تأكيد الاقتناء'}</button><button autoFocus type="button" disabled={busy} onClick={onCancel} className="rounded-xl border px-4 py-3 text-sm font-bold">إلغاء</button></div>
  </dialog>;
}
