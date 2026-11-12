import { avatarCatalog } from '../lib/avatarCatalog';
import { RewardAmount } from './RewardAmount';
import { useEffect, useRef, useState } from 'react';
import { Settings, LockKeyhole } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { uploadAvatarArt } from '../lib/avatarUploads';
import { AvatarImage } from './AvatarImage';
import type { AvatarCollection } from '../lib/employeeFeatures';
import { abayaGrades, abayaPrice } from '../lib/bundledAvatars';
const refresh = () => window.dispatchEvent(new Event('rev4-cache-changed'));
const field = 'block mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm bg-white';
const amount = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

function PriceStepper({ collectionId, variantId = null, price, label, premium = false }: { collectionId: string; variantId?: string | null; price: number; label: string; premium?: boolean }) {
  const minimum = premium ? 12499 : 0;
  const maximum = premium ? 1000000 : 4000;
  const [value, setValue] = useState(price);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(price);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPress = useRef(false);
  const held = useRef(false);
  useEffect(() => { if (!inFlight.current) { current.current = price; setValue(price); } }, [price]);
  function stop() {
    held.current = false;
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }
  useEffect(() => () => { if (timer.current !== null) clearInterval(timer.current); }, []);
  async function adjust(step: number) {
    if (inFlight.current) return;
    const expected = current.current;
    const next = step === 0 || (step < 0 && expected <= minimum) ? 0 : Math.max(minimum, Math.min(maximum, expected + step));
    if (next === expected) { stop(); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('adjust_avatar_price', { requested_collection: collectionId, requested_variant: variantId, step, expected_price: expected });
      if (error) throw error;
      current.current = next; setValue(next);
      if (next === 0 || next === maximum) stop();
      if (!held.current) refresh();
    } catch { stop(); refresh(); setError('تعذر حفظ السعر. تم تحديث بيانات المتجر؛ أعيدي المحاولة.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function press(event: React.PointerEvent<HTMLButtonElement>, direction: number) {
    if (event.button !== 0) return;
    stop(); held.current = true; longPress.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    timer.current = setInterval(() => { longPress.current = true; void adjust(direction * 500); }, 1000);
  }
  function release() { const wasHeld = held.current; stop(); if (wasHeld && longPress.current && !inFlight.current) refresh(); }
  const buttonClass = 'size-11 shrink-0 touch-none select-none rounded-xl border border-slate-300 bg-white text-xl font-bold disabled:opacity-50';
  return <div className="space-y-1" onClick={event => event.stopPropagation()}>
    <div role="group" aria-label={`تعديل سعر ${label}`} aria-busy={busy} className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" disabled={value <= 0} aria-label={`خفض سعر ${label} 50 عملة`} onPointerDown={event => press(event, -1)} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={event => event.preventDefault()} onClick={event => { if (event.detail === 0 || !longPress.current) void adjust(-50); }} className={buttonClass}>−</button>
      <RewardAmount kind="coins" value={value} />
      <button type="button" disabled={value >= maximum} aria-label={`زيادة سعر ${label} 50 عملة`} onPointerDown={event => press(event, 1)} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={event => event.preventDefault()} onClick={event => { if (event.detail === 0 || !longPress.current) void adjust(50); }} className={buttonClass}>+</button>
      <button type="button" disabled={busy || value >= maximum} aria-label={`إضافة 500 عملة إلى سعر ${label}`} onClick={() => { stop(); void adjust(500); }} className="min-h-11 rounded-xl border border-teal-300 bg-teal-50 px-3 text-sm font-bold text-teal-900 disabled:opacity-50">+500</button>
      <button type="button" disabled={busy || value <= 0} aria-label={`تصفير سعر ${label} وإخفاؤه من البيع`} onClick={() => { stop(); void adjust(0); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-50">0</button>
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

function CollectionPreview({ collection }: { collection: AvatarCollection }) {
  const [expanded, setExpanded] = useState(false);
  return <article className="bg-white overflow-hidden">
    <button type="button" aria-expanded={expanded} aria-controls={`admin-avatar-group-${collection.id}`} onClick={() => setExpanded(value => !value)} className="w-full text-right p-4 flex items-center gap-4 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600">
      <AvatarImage path={collection.variants[0]?.imagePath || null} alt="" className="h-24 w-16 object-contain shrink-0"/>
      <span className="flex-1 min-w-0"><span className="block font-bold text-lg text-slate-900 break-words">{collection.name}</span>
      </span>
      <span className="text-center shrink-0 text-teal-900 font-black"><RewardAmount kind="coins" value={collection.price} /></span>
    </button>
    <div className="px-4 pb-3"><PriceStepper collectionId={collection.id} price={collection.price} label={`الحذاء ${collection.name}`} premium={collection.name.trim().toLowerCase() === 'lv olympia'} /></div>
    {expanded && <div id={`admin-avatar-group-${collection.id}`} className="bg-white py-3 grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
      {collection.variants.length === 0 && <p className="col-span-full text-sm text-slate-600">ستُضاف أشكال هذه المجموعة قريبًا.</p>}
      {collection.variants.map(variant => <div key={variant.id} className="min-w-0 bg-white space-y-3">
        <div className="shop-art-stage"><AvatarImage path={variant.imagePath} alt={variant.name} className="h-40 w-full object-contain relative z-10"/></div>
        <h4 className="text-center text-sm font-bold text-slate-900">{variant.name}</h4>
        {variant.ownerId ? <p className="text-xs text-purple-900 flex gap-1 items-start"><LockKeyhole size={13} className="shrink-0"/>حصرية لـ {variant.ownerName || 'مالكتها'}</p> : !variant.enabled || !collection.enabled ? <p className="text-xs text-slate-600">غير معروض للبيع</p> : null}
        <PriceStepper collectionId={collection.id} variantId={variant.id} price={variant.price ?? collection.price} label={`النموذج ${variant.name}`} premium={collection.name.trim().toLowerCase() === 'lv olympia'} />
      </div>)}
    </div>}
  </article>;
}

export function AvatarStoreAdmin() {
  const { features, currentAccount } = useData();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('1349');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (currentAccount?.role !== 'admin') return null;
  return <section aria-label="إدارة متجر الأفتارات" className="space-y-5" dir="rtl">
    <div className="avatar-shop bg-white space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-black text-2xl text-slate-900">متجر الأفتارات</h2>
        <button type="button" aria-expanded={settingsOpen} aria-controls="avatar-store-settings" onClick={() => setSettingsOpen(value => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800"><Settings size={18}/>الإعدادات</button>
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
      <label className="text-sm font-bold">السعر الأساسي<input required type="number" min="50" max="1000000" step="1" value={price} onChange={event => setPrice(event.target.value)} className={field}/></label>
      <button disabled={busy} className="action-primary">{busy ? 'جارٍ الإنشاء…' : 'إضافة أفاتار'}</button>
    </form>
    {message && <p role="status" className="text-sm text-indigo-900">{message}</p>}
    {features.store.collections.length === 0 && <p className="rounded-xl border border-dashed p-5 text-slate-600">لا توجد مجموعات مسجلة في المتجر بعد.</p>}
    {features.store.collections.map(collection => <CollectionEditor key={`${collection.id}:${collection.name}:${collection.price}:${collection.enabled}`} collection={collection}/>)}
    </>}
    </section>}
      {!!features?.store?.goldRequests?.length && <section className="space-y-3 rounded-2xl bg-amber-50 p-4">
        <h3 className="font-black text-amber-950">طلبات تصميم أم خماس</h3>
        {features.store.goldRequests.map(request => <GoldRequest key={request.id} request={request} />)}
      </section>}
      <div className="space-y-4">
        {avatarCatalog(features?.store?.collections ?? [])
          .filter(collection => !['الذوق السعودي الحديث', 'simple'].includes(collection.name.trim()))
          .map(collection => <CollectionPreview key={collection.id} collection={collection}/>)}
      </div>
    </div>

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
      <label className="text-sm font-bold">السعر الأساسي<input required type="number" min="50" max="1000000" step="1" value={price} onChange={event => setPrice(event.target.value)} className={field}/></label>
      <button disabled={busy} className="action-primary">حفظ الإعدادات</button>
      <PriceStepper collectionId={collection.id} price={collection.price} label={`الحذاء ${collection.name}`} premium={collection.name.trim().toLowerCase() === 'lv olympia'} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-5 w-5 accent-indigo-700"/>معروض في المتجر</label>
    </form>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{collection.variants.map(variant => <div key={variant.id} className="rounded-xl border bg-slate-50 p-3 text-center space-y-2">
      <AvatarImage path={variant.imagePath} alt={variant.name} className="h-32 w-full object-contain"/><p className="font-bold text-sm">{variant.name}</p>
      <p className={`text-xs ${variant.ownerId ? 'text-purple-800' : 'text-emerald-800'}`}>{variant.ownerId ? `اقتنتْه ${variant.ownerName || 'موظفة'}` : 'متاح · نسخة واحدة'}</p>
      <PriceStepper collectionId={collection.id} variantId={variant.id} price={variant.price ?? collection.price} label={`النموذج ${variant.name}`} premium={collection.name.trim().toLowerCase() === 'lv olympia'} />
      <label className="block text-xs font-bold">زينة العباءة
        <select value={variant.abayaGrade ?? 0} disabled={busy} className={field} onChange={event => {
          const grade = Number(event.target.value);
          void perform(async () => {
            const { error } = await supabase.rpc('set_avatar_abaya_grade', { variant: variant.id, requested_grade: grade });
            if (error) throw new Error('تعذر حفظ درجة الزينة.');
          }, 'تم تحديث درجة الزينة.');
        }}>
          {abayaGrades.map((label, grade) => <option key={label} value={grade}>{label} · {amount(variant.price === undefined ? abayaPrice(collection.price, grade, collection.name.trim().toLowerCase() === 'lv olympia') : variant.price + 50 * (grade - (variant.abayaGrade ?? 0)))}</option>)}
        </select>
      </label>
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

function GoldRequest({ request }: { request: { id: string; name: string; imagePath: string } }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 p-3" onSubmit={async event => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const path = await uploadAvatarArt(file);
      const { error } = await supabase.rpc('fulfill_gold_avatar', { variant: request.id, requested_path: path });
      if (error) {
        await supabase.storage.from('avatar-store').remove([path]);
        throw error;
      }
      refresh();
    } catch {
      setError('تعذر تسليم التصميم. تحققي من الاتصال والصورة.');
    } finally {
      setBusy(false);
    }
  }}>
    <AvatarImage path={request.imagePath} alt={request.name} className="h-24 w-16 object-contain" />
    <label className="text-sm font-bold">{request.name} · التصميم الذهبي
      <input type="file" required accept="image/png,image/jpeg,image/webp" className={field} onChange={event => setFile(event.target.files?.[0] || null)} />
    </label>
    <button className="action-primary" disabled={busy || !file}>تسليم التصميم</button>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </form>;
}
