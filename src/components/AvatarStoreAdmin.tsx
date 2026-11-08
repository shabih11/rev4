import { useState } from 'react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { uploadAvatarArt } from '../lib/avatarUploads';
import { AvatarImage } from './AvatarImage';
import type { AvatarCollection } from '../lib/employeeFeatures';
const refresh = () => window.dispatchEvent(new Event('rev4-cache-changed'));
const field = 'block mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm bg-white';
const saudiModernAvatars = Array.from({ length: 30 }, (_, index) => String(index + 1).padStart(2, '0'));

function BundledAvatarGallery() {
  return <section aria-labelledby="bundled-avatar-heading" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
    <div>
      <h4 id="bundled-avatar-heading" className="font-bold text-slate-900">الذوق السعودي الحديث · {saudiModernAvatars.length} شكلًا</h4>
      <p className="mt-1 text-sm text-slate-600">معاينة المجموعة للإدارة فقط.</p>
    </div>
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {saudiModernAvatars.map(number => <li key={number} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
        <img src={`${import.meta.env.BASE_URL}avatars/saudi-modern-v1/avatar-${number}.png`} alt={`أفاتار الذوق السعودي الحديث ${number}`} width={1024} height={1536} loading="lazy" decoding="async" className="h-40 w-full object-contain" />
        <p className="mt-2 text-sm font-bold">الشكل {number}</p>
      </li>)}
    </ul>
  </section>;
}

export function AvatarStoreAdmin() {
  const { features, currentAccount } = useData();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('5');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (currentAccount?.role !== 'admin') return null;
  return <section className="space-y-5 border-t pt-6">
    <h3 className="font-black text-xl text-slate-900">إدارة متجر الأفاتار</h3>
    <BundledAvatarGallery />
    {!features?.store ? <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">تعذر تحميل المجموعات المسجلة في المتجر. تحققي من الاتصال.</p> : <>
    <p className="text-sm leading-7 text-slate-600">يُباع كل شكل مسجل مرة واحدة بسعر الأفاتار، ويظهر اسم مالكته. الصور المرفوعة ثابتة لحماية حصرية المشتريات.</p>
    <form className="grid sm:grid-cols-[1fr_9rem_auto] items-end gap-3 rounded-2xl bg-slate-50 p-4" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setMessage('');
      const { error } = await supabase.rpc('save_avatar_collection', { collection_id: null, requested_name: name.trim(), requested_price: Number(price), requested_enabled: true, expected: null });
      setBusy(false); setMessage(error ? 'تعذر إنشاء الأفاتار. تحققي من القيم والصلاحيات والاتصال.' : 'أُنشئ الأفاتار. أضيفي الأشكال بالصور أدناه.');
      if (!error) { setName(''); refresh(); }
    }}>
      <label className="text-sm font-bold">اسم الأفاتار<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} className={field}/></label>
      <label className="text-sm font-bold">سعر الشكل<input required type="number" min="0" max="1000000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} className={field}/></label>
      <button disabled={busy} className="action-primary">{busy ? 'جارٍ الإنشاء…' : 'إضافة أفاتار'}</button>
    </form>
    {message && <p role="status" className="text-sm text-indigo-900">{message}</p>}
    {features.store.collections.length === 0 && <p className="rounded-xl border border-dashed p-5 text-slate-600">لا توجد مجموعات مسجلة في المتجر بعد.</p>}
    {features.store.collections.map(collection => <CollectionEditor key={`${collection.id}:${collection.name}:${collection.price}:${collection.enabled}`} collection={collection}/>)}
    </>}
  </section>;
}
function CollectionEditor({ collection }: { collection: AvatarCollection }) {
  const [name, setName] = useState(collection.name);
  const [price, setPrice] = useState(String(collection.price));
  const [enabled, setEnabled] = useState(collection.enabled);
  const [variantName, setVariantName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function perform(action: () => Promise<void>, success: string) {
    if (busy) return; setBusy(true); setMessage('');
    try { await action(); setMessage(success); refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر حفظ التعديل. حدّثي الصفحة بعد التحقق من الاتصال.'); }
    finally { setBusy(false); }
  }
  return <article className="rounded-2xl border border-slate-200 p-5 space-y-5 bg-white">
    <form className="grid sm:grid-cols-[1fr_8rem_auto] items-end gap-3" onSubmit={event => {
      event.preventDefault(); void perform(async () => {
        const { error } = await supabase.rpc('save_avatar_collection', { collection_id: collection.id, requested_name: name.trim(), requested_price: Number(price), requested_enabled: enabled, expected: { name: collection.name, price: collection.price, enabled: collection.enabled } });
        if (error) throw new Error('تعذر الحفظ أو تغيرت البيانات. حدّثي الصفحة ثم أعيدي المحاولة.');
      }, 'تم حفظ الأفاتار.');
    }}>
      <label className="text-sm font-bold">اسم الأفاتار<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} className={field}/></label>
      <label className="text-sm font-bold">سعر الشكل<input required type="number" min="0" max="1000000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} className={field}/></label>
      <button disabled={busy} className="action-primary">حفظ الإعدادات</button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-5 w-5 accent-indigo-700"/>معروض في المتجر</label>
    </form>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{collection.variants.map(variant => <div key={variant.id} className="rounded-xl border bg-slate-50 p-3 text-center space-y-2">
      <AvatarImage path={variant.imagePath} alt={variant.name} className="h-32 w-full object-contain"/><p className="font-bold text-sm">{variant.name}</p>
      <p className={`text-xs ${variant.ownerId ? 'text-purple-800' : 'text-emerald-800'}`}>{variant.ownerId ? `اقتنتْه ${variant.ownerName || 'موظفة'}` : 'متاح · نسخة واحدة'}</p>
      <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={variant.enabled} disabled={busy} onChange={event => { const next = event.target.checked; void perform(async () => { const { error } = await supabase.rpc('set_avatar_variant_enabled', { variant: variant.id, requested_enabled: next }); if (error) throw new Error('تعذر تغيير العرض.'); }, 'تم تحديث عرض الشكل.'); }}/>معروض للبيع</label>
    </div>)}</div>
    <form className="grid gap-3 sm:grid-cols-2 border-t pt-4" onSubmit={event => {
      event.preventDefault(); if (!file) return;
      void perform(async () => {
        const path = await uploadAvatarArt(file);
        const { error } = await supabase.rpc('add_avatar_variant', { collection_id: collection.id, requested_name: variantName.trim(), requested_path: path });
        if (error) { await supabase.storage.from('avatar-store').remove([path]); throw new Error('تعذر حفظ الشكل بعد الرفع. تحققي من البيانات ثم أعيدي المحاولة.'); }
        setVariantName(''); setFile(null); setInputKey(value => value + 1);
      }, 'أُضيف الشكل الحصري للمتجر.');
    }}>
      <label className="text-sm font-bold">اسم الشكل<input required maxLength={100} value={variantName} onChange={event => setVariantName(event.target.value)} className={field}/></label>
      <label className="text-sm font-bold">الصورة الكاملة<input key={inputKey} required type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} className={field}/></label>
      <p className="text-xs text-slate-500 sm:col-span-2">PNG أو WebP بخلفية شفافة للحصول على أفضل نتيجة، أو JPEG. حتى 5 ميغابايت و4096 بكسل لكل بُعد.</p>
      <button disabled={busy || collection.variants.length >= 50} className="action-primary sm:col-span-2">{busy ? 'جارٍ الحفظ…' : 'رفع وإضافة شكل حصري'}</button>
    </form>
    {message && <p role="status" className="text-sm text-indigo-900">{message}</p>}
  </article>;
}
