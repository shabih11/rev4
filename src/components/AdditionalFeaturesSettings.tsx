import { MagicStoreAdmin } from './MagicStoreAdmin';
import { useState } from 'react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { validFeatureSettings } from '../lib/employeeFeatures';
import type { FeatureSettings } from '../lib/employeeFeatures';

const switches = [
  ['competition', 'المنافسة اليومية', 'إظهار أسماء الموظفات اللاتي تجاوزتهن الموظفة منذ نهاية أمس.'],
  ['balanceGrowth', 'زيادة رصيد التقييمات', 'عرض الزيادة اليومية باللون الأخضر بجانب الرصيد.'],
  ['branchBadges', 'شارات الفروع', 'إظهار شارات التقييمات وقهوة الأحد والانطلاق الصاروخي ومهمة البحر ومعاينتها. إخفاؤها لا يحذف الإنجازات.'],
  ['tiers', 'شارات الفئات', 'خبيرة للفئة الفضية ومتميزة للفئة الذهبية.'],
  ['avatars', 'متجر الأفاتار', 'أفاتارات كاملة بأشكال حصرية، تُقتنى من رصيد مستقل دون خفض الترتيب.'],
  ['missions', 'المهام والمستويات', 'رحلة إنجاز مرتبطة بالتقييمات المستوردة، مع نجوم ومهام ومستويات للموظفات. تعطيلها يخفيها دون حذف التقدم المحسوب من التقييمات.'],
  ['rounding', 'نظام الجبر', 'جبر نقاط الفئة إلى العدد الصحيح الأعلى، ودمج زيادة المكافأة مع الزيادة الجماعية. المكافأة من مضاعفات العشرة، وسقف الزيادة 20 ريال إلا عند الحاجة لضمان الحد الأدنى 100 ريال للمستحقة.'],
] as const;
export function AdditionalFeaturesSettings() {
  const { features } = useData();
  if (!features) return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">إعدادات الميزات غير متاحة. تحققي من الاتصال وتطبيق تحديث قاعدة البيانات.</p>;
  return <div className="space-y-8"><SettingsForm key={JSON.stringify(features.settings)} initial={features.settings}/><MagicStoreAdmin/></div>;
}
function SettingsForm({ initial }: { initial: FeatureSettings }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    if (!validFeatureSettings(settings)) { setMessage('يجب أن يكون حد الفضي أكبر من صفر وأقل من حد الذهبي، وحد الذهبي لا يتجاوز 11.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('save_employee_features', { requested: settings, expected: initial });
    setBusy(false);
    setMessage(error ? error.code === '22023' ? 'تعذر حفظ الميزات؛ تأكدي من صحة الإعدادات وتطبيق تحديث الميزات في قاعدة البيانات.' : 'تعذر الحفظ. تحققي من الصلاحيات والاتصال، أو حدّثي الصفحة إذا عدّل مدير آخر الإعدادات.' : 'تم حفظ الميزات لجميع الموظفات.');
    if (!error) window.dispatchEvent(new Event('rev4-cache-changed'));
  }}>
    <div><p className="text-sm font-bold text-purple-700">مساحة التميّز</p><h2 className="text-2xl font-black mt-1">الميزات الإضافية</h2><p className="text-slate-600 mt-2">تحكّمي بتجربة الموظفات. تُطبّق الإعدادات على جميع الفروع.</p></div>
    <div className="grid md:grid-cols-2 gap-4">{switches.map(([key, title, description]) => <label key={key} className="flex gap-4 items-start rounded-2xl border border-slate-200 bg-slate-50 p-5 cursor-pointer">
      <input type="checkbox" role="switch" checked={settings[key] ?? false} onChange={event => setSettings({ ...settings, [key]: event.target.checked })} className="mt-1 w-5 h-5 accent-indigo-700" />
      <span><span className="block font-bold text-slate-900">{title}</span><span className="block text-sm text-slate-600 mt-2 leading-6">{description}</span></span>
    </label>)}</div>
    <fieldset className="rounded-2xl border p-5 space-y-4"><legend className="font-bold px-2">حدود الفئات حسب نقاط الشهر من 11</legend>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="font-bold">بداية الفئة الفضية<input required type="number" step="0.1" min="0.1" max="10.9" value={settings.silverAt} onChange={event => setSettings({ ...settings, silverAt: event.target.valueAsNumber })} className="block border rounded-xl p-3 mt-2 w-full" /></label>
        <label className="font-bold">بداية الفئة الذهبية<input required type="number" step="0.1" min="0.2" max="11" value={settings.goldAt} onChange={event => setSettings({ ...settings, goldAt: event.target.valueAsNumber })} className="block border rounded-xl p-3 mt-2 w-full" /></label>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-sm"><p className="rounded-xl bg-orange-50 text-orange-950 p-4">Bronze · أقل من {settings.silverAt}</p><p className="rounded-xl bg-slate-100 text-slate-900 p-4">Silver · من {settings.silverAt} إلى أقل من {settings.goldAt}</p><p className="rounded-xl bg-amber-50 text-amber-950 p-4">Gold · {settings.goldAt} فأكثر</p></div>
    </fieldset>
    <p className="text-sm text-slate-600">مكافآت النتائج: يشترط رصيد 7.1 تقييمات على الأقل مع استحقاق الفئة؛ الذهبية من 11 نقطة × 14 ريال، والفضية من 8 نقاط × 10 ريالات لكل رصيد تقييم فعلي. لا تقل مكافأة المستحقة عن 100 ريال حتى عند إيقاف الجبر. تُحسب الزيادة الجماعية من جميع المستحقات في الشهر، بما في ذلك من خارج منصة الأوائل السبع.</p>
    <p className="text-sm text-slate-600">المقارنة مع بداية آخر يوم وصلت فيه تقييمات بتوقيت الرياض؛ تبقى التقدمات ظاهرة حتى وصول تحديث يوم جديد.</p>
    {message && <p role="status" className="text-sm font-bold text-indigo-900">{message}</p>}
    <button disabled={busy} className="action-primary">{busy ? 'جارٍ الحفظ…' : 'حفظ الميزات'}</button>
  </form>;
}
