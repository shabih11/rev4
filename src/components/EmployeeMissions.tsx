import { MissionRewards, RewardAmount } from './RewardAmount';
import { formatRewardAmount } from '../lib/formatRewardAmount';
import { AchievementBadge } from './AchievementBadge';
import { EmployeeRankMission } from './EmployeeRankMission';
import { EmployeeTierMissions } from './EmployeeTierMissions';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { employeeMissions, employeeLevel } from '../lib/employeeMissions';

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
      <div className="flex justify-between gap-3 text-sm"><span>نحو المستوى {number(state.level.level + 1)}</span><RewardAmount kind="stars" value={`${formatRewardAmount(state.level.current)} / ${formatRewardAmount(state.level.required)}`} /></div>
      <div role="progressbar" aria-label="تقدم المستوى" aria-valuemin={0} aria-valuemax={state.level.required} aria-valuenow={state.level.current} className="mt-2 h-3 overflow-hidden rounded-full bg-cyan-800">
        <div className="h-full rounded-full bg-amber-300" style={{ width: `${state.level.current / state.level.required * 100}%` }} />
      </div>
    </header>
    <div className="p-5 sm:p-6">

      <EmployeeRankMission />
      <EmployeeTierMissions />
      {(['daily', 'monthly'] as const).filter(period => state.missions.some(mission => mission.period === period)).map(period => <div key={period} className="mb-5">
        <h3 className="flex items-center justify-between gap-2 font-black text-slate-800">{period === 'daily' ? 'تحدي اليوم' : 'مهام الشهر'}</h3>
        <ul className="divide-y divide-slate-100">{state.missions.filter(mission => mission.period === period).map(mission => {
          return <li key={mission.id} className="flex items-center gap-2 py-3 sm:gap-3">
            <AchievementBadge progress={mission.current / mission.target} missionId={mission.id} band={mission.band} />
            <div className="min-w-0 flex-1">
              {mission.id === 'daily-two' ? <h4 className="font-bold text-slate-800">{mission.target === 2 ? 'تقييمين في يوم' : `${number(mission.target)} تقييمات في يوم`}</h4> : <>
                <h4 className="font-bold text-slate-800">{mission.title}</h4>
                <p className="mt-1 text-xs leading-5 text-slate-600">{mission.description.replace(' هذا الشهر.', '').replace('هذا الشهر.', '').replace(/\.$/, '')}</p>
              </>}
            </div>
            <MissionRewards stars={mission.stars} coins={mission.coins} />
          </li>;
        })}</ul>
      </div>)}
    </div>
  </section>;
}
