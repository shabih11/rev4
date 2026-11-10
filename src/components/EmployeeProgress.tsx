import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { employeeMissions } from '../lib/employeeMissions';
import { AchievementBadge } from './AchievementBadge';
import { AvatarImage } from './AvatarImage';
import { supabase } from '../lib/supabase';

const number = (value: number) => value.toLocaleString('ar-SA-u-nu-latn');
const degrees = ['بداية', 'متقدم', 'متألق', 'خبير'];
export function EmployeeProgress({ employeeId }: { employeeId: string }) {
  const { reviewSummaries, summaryReady, syncError, features, currentAccount, resultsMode } = useData();
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const state = useMemo(() => employeeMissions(employeeId, reviewSummaries, now), [employeeId, reviewSummaries, now]);
  if (!summaryReady || syncError || resultsMode) return null;
  const store = features?.store;
  const own = currentAccount?.id === employeeId;
  const badgeMissions = [...state.missions];
  for (const achievement of state.achievements) {
    if (!badgeMissions.some(m => m.id === achievement.id)) badgeMissions.push({ ...achievement, description: '', hint: '', effort: '', period: 'monthly', current: 1, target: 1, stars: 0, coins: 0 });
  }
  const avatars = store?.collections.flatMap(c => c.variants.filter(v => v.ownerId === employeeId)) || [];
  async function equip(variant: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('equip_avatar', { variant });
      if (error) throw error;
      window.dispatchEvent(new Event('rev4-cache-changed'));
      setMessage('تم تحديث الأفاتار.');
    } catch { setMessage('تعذر اختيار الأفاتار. حاولي مرة أخرى.'); }
    finally { setBusy(false); }
  }
  return <div className="col-span-full min-w-0 space-y-6 border-b border-blue-100 pb-5">
    {features?.settings.missions && <>
      <section aria-label="إنجازات الموظفة"><h3 className="mb-3 font-black text-blue-950">إنجازاتي</h3><div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">{badgeMissions.map(mission => {
        const earned = state.achievements.filter(a => a.id === mission.id);
        const highest = earned.reduce((best, a) => Math.max(best, a.band), 0);
        return <details key={mission.id} className="min-w-0 text-center">
          <summary className="flex min-h-28 cursor-pointer list-none flex-col items-center rounded-xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <AchievementBadge progress={earned.length ? 1 : mission.current / mission.target} missionId={mission.id}/>
            <span className="text-xs font-bold leading-5 text-slate-800">{mission.title}</span>
            <span className="mt-1 text-[11px] text-slate-600">{earned.length ? `مكتسب · ${degrees[highest]}` : <bdi dir="ltr">{number(mission.current)} / {number(mission.target)}</bdi>}</span>
            <span className="mt-1 text-[11px] text-blue-700">تفاصيل المهمة</span>
          </summary>
          <div className="rounded-xl bg-blue-50 p-3 text-right text-xs leading-6 text-slate-700">{mission.description ? <>
            <p>{mission.description}</p><p className="mt-1 font-bold">{number(mission.stars)} نجمة + {number(mission.coins)} عملة</p>
            <p>تقدم {mission.period === 'daily' ? 'اليوم' : 'الشهر'}: <bdi dir="ltr">{number(mission.current)} / {number(mission.target)}</bdi></p>
            <p className="mt-1">{mission.hint}</p>
          </> : <p>إنجاز مكتسب في فترة سابقة.</p>}</div>
        </details>;
      })}</div><p className="mt-3 text-xs leading-6 text-slate-500">تتلوّن أجزاء الشارة عند إكمال كل ربع من الهدف. الشارات المكتسبة تبقى عبر الأشهر. اضغطي على الشارة لعرض المهمة والتقدم والمكافأة.</p></section>
      <section aria-label="مستوى الموظفة" className="space-y-3">
        <div className="flex items-center gap-3"><AchievementBadge progress={state.level.current / state.level.required}/><div className="min-w-0 flex-1"><h3 className="font-black text-blue-950">المستوى {number(state.level.level)}</h3><p className="mt-1 text-xs text-slate-600">{number(state.stars)} نجمة تقدم منذ نوفمبر 2026</p></div></div>
        <div className="flex justify-between gap-2 text-xs text-blue-950"><span>نحو المستوى {number(state.level.level + 1)}</span><bdi dir="ltr">{number(state.level.current)} / {number(state.level.required)}</bdi></div>
        <div role="progressbar" aria-label="تقدم مستوى الموظفة" aria-valuemin={0} aria-valuemax={state.level.required} aria-valuenow={state.level.current} className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${state.level.current / state.level.required * 100}%` }}/></div>
      </section>
    </>}
    {features?.settings.avatars && <section aria-label="مجموعة أفاتارات الموظفة">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-blue-950">أفاتاراتي <span className="text-sm font-normal">({number(avatars.length)})</span></h3>{own && store?.wallet && <span className="text-sm font-bold text-amber-800">{number(store.wallet.available)} عملة</span>}</div>
      {!store ? <p className="text-sm text-slate-600">تعذر تحميل المجموعة حاليًا.</p> : avatars.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{avatars.map(avatar => {
        const selected = store.equipped[employeeId] === avatar.imagePath;
        return <div key={avatar.id} className={`min-w-0 rounded-xl border p-3 text-center ${selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}><AvatarImage path={avatar.imagePath} alt={avatar.name} className="h-36 w-full object-contain"/><p className="mt-2 break-words text-xs font-bold">{avatar.name}</p>{selected ? <p className="mt-2 text-xs font-bold text-blue-700">الأفاتار الحالي</p> : own && <button type="button" disabled={busy} onClick={() => void equip(avatar.id)} className="mt-2 min-h-11 w-full rounded-lg border border-blue-200 text-xs font-bold text-blue-800 disabled:opacity-50">استخدام الأفاتار</button>}</div>;
      })}</div> : <p className="text-sm leading-7 text-slate-600">لم تقتني أفاتارات بعد. تظهر المشتريات هنا، والشراء متاح للفضية فأعلى.</p>}
      {message && <p role="status" className="mt-3 text-sm text-blue-800">{message}</p>}
    </section>}
  </div>;
}
