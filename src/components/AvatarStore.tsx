import { avatarCatalog } from '../lib/avatarCatalog';
import { RewardAmount } from './RewardAmount';
import { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Check, LockKeyhole } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import type { UserAccount } from '../lib/mockData';
import type { AvatarCollection, AvatarVariant } from '../lib/employeeFeatures';
import { AvatarImage } from './AvatarImage';
import { AvatarPreview } from './AvatarPreview';
import { EmployeeAvatar } from './EmployeeFeatures';
const startingPrice = (collection: AvatarCollection) => {
  const available = collection.variants.filter(variant => priceFor(collection, variant) > 0);
  return available.length ? Math.min(...available.map(variant => priceFor(collection, variant))) : null;
};
const priceFor = (collection: AvatarCollection, variant: AvatarVariant) => variant.price ?? collection.price;
export function AvatarStore({ employee }: { employee: UserAccount }) {
  const { features, currentAccount } = useData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<{ collection: AvatarCollection; variant: AvatarVariant } | null>(null);
  const [preview, setPreview] = useState<AvatarVariant | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!features?.settings.avatars || employee.role !== 'employee' || currentAccount?.id !== employee.id) return null;
  const store = features.store;
  if (!store || !store.wallet) return <section className="bg-white p-4 sm:p-6"><h3 className="font-bold">متجر الأفاتار</h3><p role="status" className="mt-2 text-sm text-slate-600">المتجر غير متاح حاليًا. تحققي من الاتصال.</p></section>;
  const wallet = store.wallet;
  const collections = avatarCatalog(store.collections);
  async function equip(variant: string | null) {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('equip_avatar', { variant });
      if (error) throw error;
      window.dispatchEvent(new Event('rev4-cache-changed')); setMessage('تم تحديث الأفاتار.');
    } catch { setMessage('تعذر اختيار الأفاتار. تحققي من الاتصال وملكية الشكل.'); }
    finally { setBusy(false); }
  }
  return <section className="avatar-shop w-full bg-white px-4 py-5 sm:p-6 space-y-6">
    <header className="flex items-center gap-2 sm:gap-4">
      <EmployeeAvatar employee={employee} className="h-24 w-14 shrink-0 sm:h-28 sm:w-20" />
      <h3 className="min-w-0 text-lg font-black text-slate-900 sm:text-2xl">متجر الأفاتار</h3>
      <p className="ms-auto shrink-0 rounded-xl bg-teal-50 px-2 py-1 text-lg font-black text-teal-900 sm:px-3 sm:text-2xl">
        <span className="sr-only">الرصيد المتاح </span><RewardAmount kind="coins" value={wallet.available} />
      </p>
    </header>
    {store.goldEntitled && <p className="text-sm font-bold text-amber-900">امتياز أم خماس مملوك لحسابك؛ يُرسل طلب تحويل الأفتارات الجديدة تلقائيًا لمدير النظام.</p>}
    <button type="button" disabled={busy || !store.selectedVariant} data-usage-action="equip" onClick={() => void equip(null)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-50">استخدام الأفاتار الافتراضي</button>
    {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}
    {store.collections.length === 0 && <p className="p-6 text-center text-slate-600">لا توجد أفاتارات متاحة حاليًا.</p>}
    <div className="space-y-4">{collections.map(collection => <article key={collection.id} className="overflow-hidden">
      <button type="button" aria-expanded={expanded === collection.id} aria-controls={`avatar-group-${collection.id}`} data-usage-action="open_details" onClick={() => setExpanded(expanded === collection.id ? null : collection.id)} className="w-full text-right py-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600">
        <AvatarImage path={collection.variants[0]?.imagePath || null} alt="" className="h-24 w-16 object-contain shrink-0" />
        <span className="min-w-0 flex-1 sm:flex-none sm:w-28">
          <span className="block font-bold text-lg text-slate-900 break-words">{collection.name}</span>
          {[...new Set(collection.variants.filter(variant => variant.ownerId).map(variant => variant.ownerName || 'مالكتها'))].map(name => <span key={name} className="mt-2 inline-block rounded-lg bg-purple-50 px-2 py-1 text-xs font-bold text-purple-900 me-1">{name}</span>)}
        </span>
        <span className="order-last grid w-full sm:order-none sm:w-auto sm:flex-1 min-w-0 grid-cols-6 items-center justify-items-center gap-1 sm:gap-2">
          {collection.variants.map(variant => <AvatarImage key={variant.id} path={variant.imagePath} alt={variant.name} className="h-16 w-full max-w-10 object-contain" />)}
        </span>
        <span className="text-center shrink-0 text-teal-900 font-black">{startingPrice(collection) !== null && <RewardAmount kind="coins" value={startingPrice(collection)!} />}<span className="block text-xs font-normal mt-1">{startingPrice(collection) === null ? 'غير متاح' : 'يبدأ من'}</span></span>
      </button>
      {expanded === collection.id && <div id={`avatar-group-${collection.id}`} className="bg-white py-4 grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {collection.variants.length === 0 && <p className="text-sm text-slate-600 col-span-full">ستُضاف أشكال هذه المجموعة قريبًا.</p>}
        {collection.variants.map(variant => {
          const price = priceFor(collection, variant);
          const owned = variant.ownerId === employee.id;
          const selected = store.selectedVariant === variant.id;
          const unavailable = Boolean(variant.ownerId) || !variant.enabled || !collection.enabled;
          return <div key={variant.id} className={`min-w-0 bg-white space-y-3 ${selected ? 'ring-2 ring-inset ring-teal-500' : ''}`}>
            <button type="button" aria-label={`عرض ${variant.name} مكبرًا`} onClick={() => setPreview(variant)} className="shop-art-stage block w-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-teal-600"><AvatarImage path={variant.imagePath} alt={variant.name} className="h-40 w-full object-contain relative z-10"/></button>
            <h4 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-bold text-slate-900 break-words"><span>{variant.name}</span></h4>
            {variant.ownerId ? <p className="text-xs text-purple-900 flex gap-1 items-start"><LockKeyhole size={13} className="shrink-0"/>حصرية لـ {variant.ownerName || 'مالكتها'}</p> : unavailable ? <p className="text-xs text-slate-600">غير معروض للبيع</p> : null}
            <p className="text-base font-black text-teal-900"><RewardAmount kind="coins" value={price} /></p>
            {owned ? <button type="button" disabled={busy || selected} data-usage-action="equip" onClick={() => void equip(variant.id)} className="w-full rounded-xl border border-teal-300 bg-teal-50 px-2 py-3 text-xs font-bold text-teal-900 disabled:opacity-60">{selected ? <span className="inline-flex items-center gap-1"><Check size={14}/>الأفاتار الحالي</span> : 'استخدام هذا الشكل'}</button> : <button type="button" disabled={busy || unavailable || wallet.available < price} onClick={() => { setReceipt(false); setPending({ collection, variant }); }} className="w-full rounded-xl bg-teal-700 text-white px-3 py-3 text-sm font-bold transition-colors hover:bg-teal-800 active:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:bg-slate-100 disabled:text-slate-500">{variant.ownerId ? variant.ownerName || 'مالكتها' : unavailable ? 'غير معروض للبيع' : wallet.available < price ? 'الرصيد غير كافٍ' : <>اقتناء بـ <RewardAmount kind="coins" value={price} /></>}</button>}

          </div>;
        })}
      </div>}
    </article>)}</div>
    {preview && <AvatarPreview path={preview.imagePath} name={preview.name} onClose={() => setPreview(null)} />}
    {pending && <PurchaseDialog item={pending} balance={wallet.available} buyer={employee.name} receipt={receipt} busy={busy} receiptMessage={message} onCancel={() => { if (!busy) setPending(null); }} onConfirm={async () => {
      if (busy) return false; setBusy(true); setMessage('');
      try {
        const { error } = await supabase.rpc('purchase_avatar', {
          variant: pending.variant.id, expected_price: priceFor(pending.collection, pending.variant),
        });
        if (error) throw error;
        setReceipt(true); setMessage(store.goldEntitled && pending.collection.name.trim().toLowerCase() !== 'lv olympia'
          ? 'اكتمل الشراء وأُرسل طلب تحويل الستايل إلى أم خماس تلقائيًا لمدير النظام.'
          : 'اكتمل الدفع بالعملات وأصبح هذا الستايل ملكك وحدك، وتم اختياره كأفاتارك الحالي.');
        window.dispatchEvent(new Event('rev4-cache-changed'));
        return true;
      } catch { setPending(null); setMessage('لم تكتمل عملية الشراء. قد يكون الشكل قد بيع أو تغير السعر أو الرصيد؛ حدّثي المتجر وأعيدي المحاولة.'); window.dispatchEvent(new Event('rev4-cache-changed')); return false; }
      finally { setBusy(false); }
    }}/>}
  </section>;
}
function PurchaseDialog({ item, balance, buyer, receipt, busy, receiptMessage, onCancel, onConfirm }: { item: { collection: AvatarCollection; variant: AvatarVariant }; balance: number; buyer: string; receipt: boolean; busy: boolean; receiptMessage: string; onCancel: () => void; onConfirm: () => Promise<boolean> }) {
  const price = priceFor(item.collection, item.variant);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onCancel(); }} aria-labelledby="avatar-purchase-title" className="purchase-dialog rounded-3xl bg-white p-6 max-w-sm w-[calc(100%-2rem)] text-slate-900" dir="rtl">
    <AvatarImage path={item.variant.imagePath} alt={item.variant.name} className="h-44 w-full object-contain"/>
    <h3 id="avatar-purchase-title" className="text-xl font-black mt-4">{receipt ? 'تم تأكيد الطلب' : 'فاتورة الطلب'}</h3>
    <dl className="mt-4 divide-y divide-slate-100 text-sm">
      <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">المشترية</dt><dd className="font-bold">{buyer}</dd></div>
      <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">الحذاء</dt><dd className="font-bold">{item.collection.name}</dd></div>
      <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">ستايل</dt><dd className="font-bold">{item.variant.name}</dd></div>
      <div className="flex justify-between gap-3 py-3 text-base font-black"><dt>الإجمالي</dt><dd><RewardAmount kind="coins" value={price}/></dd></div>
      {!receipt && <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">الرصيد بعد الشراء</dt><dd><RewardAmount kind="coins" value={Math.max(0, balance - price)}/></dd></div>}
    </dl>
    {receipt ? <><p role="status" className="mt-3 rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900">{receiptMessage}</p><button autoFocus type="button" onClick={onCancel} className="action-primary mt-5 w-full">العودة للمتجر</button></> : <div className="flex gap-3 mt-5"><button type="button" disabled={busy || balance < price} data-usage-action="purchase" onClick={() => { void onConfirm(); }} className="action-primary flex-1"><ShoppingBag size={16}/>{busy ? 'جارٍ تأكيد الطلب…' : balance < price ? 'الرصيد غير كافٍ' : 'تأكيد الاقتناء'}</button><button autoFocus type="button" disabled={busy} onClick={onCancel} className="rounded-xl border px-4 py-3 text-sm font-bold">إلغاء</button></div>}
  </dialog>;
}
