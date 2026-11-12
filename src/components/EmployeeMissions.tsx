import { MissionRewards, RewardAmount } from './RewardAmount';
import { AchievementBadge } from './AchievementBadge';
import { EmployeeRankMission } from './EmployeeRankMission';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { employeeMissions, employeeLevel, missionGrades } from '../lib/employeeMissions';

const number = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

export function EmployeeMissions({ employeeId }: { employeeId: string }) {
  const { reviewSummaries, summaryReady, syncError, resultsMode, features } = useData();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  const progress = useMemo(() => employeeMissions(employeeId, reviewSummaries, now), [employeeId, reviewSummaries, now]);
  const stars = features?.store?.wallet?.stars ?? progress.stars;
  const state = { ...progress, stars, bonusStars: Math.max(0, stars - progress.ratingStars), level: employeeLevel(stars) };
  if (resultsMode) return <section aria-label="رحلة الإنجاز" className="mx-6 mb-6 rounded-3xl border bg-white p-6">
    <h2 className="text-xl font-black">رحلة الإنجاز</h2>
    <p className="mt-2 text-sm text-slate-600">تعود المهام والمستويات عند عرض الشهر الحالي. أنتِ الآن في عرض نتائج الشهر الماضي.</p>
  </section>;
  if (!summaryReady || syncError) return <section aria-label="رحلة الإنجاز" className="mx-6 mb-6 rounded-3xl border bg-white p-6" aria-busy={!summaryReady && !syncError}>
    <h2 className="text-xl font-black">رحلة الإنجاز</h2>
    {syncError ? <p role="alert" className="mt-2 text-red-700">تعذر تحميل المهام والإنجازات. حاولي تحديث الصفحة.</p> : <p role="status" className="mt-2 text-slate-600">جارٍ تحميل مهامك وإنجازاتك…</p>}
  </section>;
  return <section aria-label="رحلة الإنجاز" className="mx-6 mb-8 overflow-hidden rounded-3xl border border-cyan-200 bg-white">
    <header className="bg-cyan-950 p-5 text-white sm:p-6">
      <div className="flex justify-between gap-3 text-sm"><span>نحو المستوى {number(state.level.level + 1)}</span><RewardAmount kind="stars" value={`${number(state.level.current)} / ${number(state.level.required)}`} /></div>
      <div role="progressbar" aria-label="تقدم المستوى" aria-valuemin={0} aria-valuemax={state.level.required} aria-valuenow={state.level.current} className="mt-2 h-3 overflow-hidden rounded-full bg-cyan-800">
        <div className="h-full rounded-full bg-amber-300" style={{ width: `${state.level.current / state.level.required * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-cyan-100">باقي <RewardAmount kind="stars" value={state.level.remaining} /> · مجموعك <RewardAmount kind="stars" value={state.stars} /></p>
    </header>
    <div className="p-5 sm:p-6">
      <dl className="mb-5 grid grid-cols-2 gap-3 border-b border-slate-100 pb-5 text-sm">
        <div><dt className="text-slate-500">نجوم التقييمات</dt><dd className="mt-1 font-black text-cyan-900"><RewardAmount kind="stars" value={state.ratingStars} /></dd></div>
        <div><dt className="text-slate-500">مكافآت المهام</dt><dd className="mt-1 font-black text-amber-800"><RewardAmount kind="stars" value={state.bonusStars} /></dd></div>
      </dl>
      <EmployeeRankMission />
      {(['daily', 'monthly'] as const).filter(period => state.missions.some(mission => mission.period === period)).map(period => <div key={period} className="mb-5">
        <h3 className="flex items-center justify-between gap-2 font-black text-slate-800">{period === 'daily' ? 'تحدي اليوم' : 'مهام الشهر'}<span className="text-xs font-normal text-slate-500">{state.missions.filter(mission => mission.period === period && mission.current + 1e-9 >= mission.target).length}/{state.missions.filter(mission => mission.period === period).length} مكتملة</span></h3>
        <ul className="divide-y divide-slate-100">{state.missions.filter(mission => mission.period === period).map(mission => {
          const done = mission.current + 1e-9 >= mission.target;
          return <li key={mission.id} className="flex items-center gap-2 py-3 sm:gap-3">
            <AchievementBadge progress={mission.current / mission.target} missionId={mission.id} band={mission.band} />
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-slate-800">{mission.title}</h4>
              <p className="text-xs font-bold text-slate-600">الدرجة {missionGrades[mission.band ?? 0]} · {mission.completedBands ?? 0}/3 درجات مكتملة</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{mission.description}</p>
              <p className={`mt-1 text-xs font-bold ${done ? 'text-emerald-700' : 'text-cyan-800'}`}>
                {done && 'مكتملة · '}<bdi dir="ltr">{number(mission.current)}/{number(mission.target)}</bdi>
              </p>
            </div>
            <MissionRewards stars={mission.stars} coins={mission.coins} />
          </li>;
        })}</ul>
      </div>)}
    </div>
  </section>;
}
