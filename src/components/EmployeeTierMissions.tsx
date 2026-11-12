import { CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { MissionRewards } from './RewardAmount';
import { TierAward } from './TierAward';

const tierNames = { silver: 'الفضية', gold: 'الذهبية' };
const number = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

export function EmployeeTierMissions() {
  const { features } = useData();
  const missions = features?.store?.wallet?.tierMissions;
  if (!features?.settings.tiers || !missions?.length) return null;
  return <section aria-label="مهام الرتب" className="mb-5">
    <h3 className="font-black text-slate-800">رحلتكِ إلى الفضية والذهبية</h3>
    <ul className="mt-3 space-y-3">{missions.map(mission => <li key={mission.id}
      className={`rounded-2xl border p-4 ${mission.completed ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 [&_svg]:size-9"><TierAward gold={mission.tier === 'gold'} iconOnly /></span>
          <h4 className="font-bold text-slate-900">{mission.completed ? `إنجاز ${tierNames[mission.tier]}` : `انتقلي إلى ${tierNames[mission.tier]}`}</h4>
        </div>
        <MissionRewards coins={mission.coins} stars={mission.stars} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">بلغي {number(mission.target)} نقاط هذا الشهر. مكافأة مستقلة لكل رتبة، مرة واحدة في الشهر.</p>
      <div role="progressbar" aria-label={`التقدم إلى ${tierNames[mission.tier]}`} aria-valuemin={0} aria-valuemax={mission.target}
        aria-valuenow={mission.current} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${mission.completed ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, mission.current / mission.target * 100)}%` }} />
      </div>
      <p className="mt-2 text-xs font-bold text-slate-700">أعلى نقاطكِ هذا الشهر: <bdi>{number(mission.current)} / {number(mission.target)}</bdi></p>
      {mission.completed && <p className="mt-2 flex items-start gap-1 text-xs font-bold leading-5 text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
        {mission.collected ? 'إنجاز مكتمل · تم جمع العملات.' : 'إنجاز مكتمل · اجمعي عملاته من لوحة الترتيب.'}
      </p>}
    </li>)}</ul>
  </section>;
}
