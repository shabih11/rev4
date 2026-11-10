import { useState } from 'react';
import { Settings, LockKeyhole } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { uploadAvatarArt } from '../lib/avatarUploads';
import { AvatarImage } from './AvatarImage';
import type { AvatarCollection } from '../lib/employeeFeatures';
import { bundledAvatars, bundledAvatarPrice } from '../lib/bundledAvatars';
const refresh = () => window.dispatchEvent(new Event('rev4-cache-changed'));
const field = 'block mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm bg-white';
const amount = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

const bundledCollection: AvatarCollection = {
  id: 'bundled-saudi-modern', name: 'الذوق السعودي الحديث', price: bundledAvatarPrice, enabled: false,
  variants: bundledAvatars.map(avatar => ({ id: avatar.id, name: avatar.name,
    imagePath: `${import.meta.env.BASE_URL}avatars/saudi-modern-v1/${avatar.image}`,
    enabled: false, ownerId: null, ownerName: null })),
};

function CollectionPreview({ collection, bundled = false }: { collection: AvatarCollection; bundled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const image = (path: string | null, alt: string, className: string) => bundled
    ? <img src={path || undefined} alt={alt} loading="lazy" decoding="async" className={className}/>
    : <AvatarImage path={path} alt={alt} className={className}/>;
  return <article className="rounded-2xl border border-slate-200 overflow-hidden">
    <button type="button" aria-expanded={expanded} aria-controls={`admin-avatar-group-${collection.id}`} onClick={() => setExpanded(value => !value)} className="w-full text-right p-4 flex items-center gap-4 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600">
      {image(collection.variants[0]?.imagePath || null, '', 'h-24 w-16 object-contain shrink-0')}
      <span className="flex-1 min-w-0"><span className="block font-bold text-lg text-slate-900 break-words">{collection.name}</span>
        <span className="block mt-2 text-sm text-slate-600">{bundled ? `${collection.variants.length} شكلًا للمعاينة` : `${collection.variants.filter(variant => !variant.ownerId && variant.enabled && collection.enabled).length} أشكال متاحة`}</span>
        <span className="block mt-2 text-xs text-teal-800 font-bold">{expanded ? 'إخفاء الأشكال −' : 'استكشاف الأشكال +'}</span>
      </span>
      <span className="text-center shrink-0 text-teal-900 font-black">{amount(collection.price)}<span className="block text-xs font-normal mt-1">{bundled ? 'سعر مقترح / شكل' : 'رصيد / شكل'}</span></span>
    </button>
    {expanded && <div id={`admin-avatar-group-${collection.id}`} className="border-t bg-slate-50 p-4 grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
      {bundled && <p className="col-span-full text-sm text-slate-600">معاينة المجموعة بسعر مقترح؛ لم تُضف هذه الأشكال للبيع بعد.</p>}
      {collection.variants.length === 0 && <p className="col-span-full text-sm text-slate-600">ستُضاف أشكال هذه المجموعة قريبًا.</p>}
      {collection.variants.map(variant => <div key={variant.id} className="rounded-2xl border border-slate-200 p-3 bg-white space-y-3">
        <div className="shop-art-stage">{image(variant.imagePath, variant.name, 'h-40 w-full object-contain relative z-10')}<span className="shop-art-plinth"/></div>
        <h4 className="text-sm font-bold text-slate-900 break-words">{variant.name}</h4>
        {variant.ownerId ? <p className="text-xs text-purple-900 flex gap-1 items-start"><LockKeyhole size={13} className="shrink-0"/>حصرية لـ {variant.ownerName || 'مالكتها'}</p> : <p className="text-xs text-slate-600">{bundled ? 'للمعاينة' : variant.enabled && collection.enabled ? 'نسخة واحدة متاحة' : 'غير معروض للبيع'}</p>}
        <p className="rounded-xl bg-teal-50 px-2 py-3 text-center text-sm font-bold text-teal-900">{amount(collection.price)} عملات{bundled ? ' · سعر مقترح' : ''}</p>
      </div>)}
    </div>}
  </article>;
}

export function AvatarStoreAdmin() {
  const { features, currentAccount } = useData();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('300');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (currentAccount?.role !== 'admin') return null;
  return <section aria-label="إدارة متجر الأفتارات" className="space-y-5" dir="rtl">
    <div className="avatar-shop rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-black text-2xl text-slate-900">متجر الأفتارات</h2>
        <button type="button" aria-expanded={settingsOpen} aria-controls="avatar-store-settings" onClick={() => setSettingsOpen(value => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800"><Settings size={18}/>الإعدادات</button>
      </div>
      <div className="space-y-4">
        {features?.store?.collections.map(collection => <CollectionPreview key={collection.id} collection={collection}/>)}
        <CollectionPreview collection={bundledCollection} bundled/>
      </div>
    </div>
    {settingsOpen && <section id="avatar-store-settings" aria-label="إعدادات متجر الأفتارات" className="space-y-5 rounded-3xl border bg-white p-5 sm:p-6">
    <h3 className="text-xl font-black text-slate-900">إعدادات متجر الأفتارات</h3>
    <p className="text-sm text-slate-600">تفعيل متجر الموظفات من تبويب الميزات الإضافية.</p>
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
    </section>}
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
