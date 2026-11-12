import { BranchBadgeRewardsAdmin } from './BranchBadgeMissions';
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
  return <div className="space-y-8"><SettingsForm key={JSON.stringify(features.settings)} initial={features.settings}/><BranchBadgeRewardsAdmin/></div>;
}
function SettingsForm({ initial }: { initial: FeatureSettings }) {
  const [settings, setSettings] = useState({ ...initial, silverAt: 8, goldAt: 11 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    if (!validFeatureSettings(settings)) { setMessage('تحققي من إعدادات الميزات.'); return; }
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
    {message && <p role="status" className="text-sm font-bold text-indigo-900">{message}</p>}
    <button disabled={busy} className="action-primary">{busy ? 'جارٍ الحفظ…' : 'حفظ الميزات'}</button>
  </form>;
}
