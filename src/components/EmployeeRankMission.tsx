import { TrendingUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import { MissionRewards } from './RewardAmount';

export function EmployeeRankMission() {
  const { features, coverageBranches } = useData();
  const mission = features?.store?.wallet?.rankChallenge;
  if (!mission) return null;
  const branch = (mission.targetId && coverageBranches[mission.targetId]) || mission.targetBranch;
  return <section aria-label="تحدي التجاوز" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <h3 className="flex items-center gap-2 font-black text-amber-950"><TrendingUp size={19} aria-hidden="true" />تحدي التجاوز</h3>
    {!mission.active ? <p className="mt-2 text-sm leading-6 text-slate-700">يفتح عند بلوغ المتصدرة رصيد ٢٠ تقييمًا أو بعد اليوم العاشر من الشهر، أيهما أولًا.</p>
      : mission.leading ? <p className="mt-2 text-sm font-bold text-emerald-800">أنتِ في الصدارة! لا توجد موظفة أمامك لتجاوزها.</p>
        : mission.targetName ? <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="min-w-0 break-words font-bold text-slate-900">تجاوزي {mission.targetName}{branch ? ` (${branch})` : ''}</h4>
            {!mission.alreadyEarned && <MissionRewards coins={mission.coins ?? 0} stars={mission.stars ?? 0} />}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{mission.alreadyEarned ? 'سبق اكتساب مكافأة هذا المركز هذا الشهر.' : `مكافأة بلوغ المركز ${mission.targetRank} بعد تجاوز رصيدها. التعادل لا يُعد تجاوزًا.`}</p>
        </> : <p className="mt-2 text-sm text-slate-700">لا يوجد هدف متاح للتجاوز الآن.</p>}
  </section>;
}
