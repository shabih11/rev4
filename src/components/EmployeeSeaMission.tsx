import { CheckCircle2 } from 'lucide-react';
import { MissionRewards } from './RewardAmount';
import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useSeaCompletions } from '../hooks/useSeaCompletions';
import { riyadhDay } from '../lib/employeeFeatures';
import { SEA_MISSION, seaBranchName, seaMission } from '../lib/seaMission';

export function EmployeeSeaMission({ employeeId, branch }: { employeeId: string; branch: string }) {
  const { reviewSummaries, summaryReady, coverageBranches } = useData();
  const [now, setNow] = useState(Date.now);
  const date = riyadhDay(new Date(now));
  const [year, month, day] = date.split('-').map(Number);
  const inCampaign = year === SEA_MISSION.year && month === SEA_MISSION.month &&
    day >= SEA_MISSION.firstDay && day <= SEA_MISSION.lastDay;
  const { completions, ready, error } = useSeaCompletions(inCampaign ? employeeId : undefined);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  if (!inCampaign) return null;
  const name = seaBranchName(coverageBranches[employeeId] || branch);
  const mission = seaMission(reviewSummaries, now, completions).branches.find(item => item.name === name)?.days.find(item => item.day === day);
  if (!mission) return <section aria-label="مهمة البحر اليوم" className="mx-6 mb-6 rounded-3xl border border-cyan-200 bg-white p-5">
    <h2 className="text-xl font-black text-cyan-950">مهمة البحر (يوميًا)</h2>
    <p className="mt-2 text-sm text-slate-700">تظهر تفاصيل المهمة بعد تحديد الفرع المشارك.</p>
  </section>;
  const completed = summaryReady && ready && !error && now >= mission.start && mission.count >= mission.target;
  return <section aria-label="مهمة البحر اليوم" className={`mx-6 mb-6 rounded-3xl border p-5 ${completed ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
    <div className="flex items-center gap-2"><h2 className="text-xl font-black text-cyan-950">مهمة البحر (يوميًا)</h2><MissionRewards stars={20} coins={25} /></div>
    {completed && <p className="mt-2 flex items-center gap-1 text-sm font-bold text-emerald-800"><CheckCircle2 size={18} aria-hidden="true" />تم اكتساب المكافأة لجميع موظفات الفرع</p>}
    <p className="mt-2 text-sm text-slate-700">هدف الفرع {mission.target} تقييمات إيجابية.</p>
    <p className="mt-2 text-sm font-bold text-cyan-900">{summaryReady ? `التقدم ${mission.count} / ${mission.target}` : 'جارٍ تحميل التقدم…'} · {error ? 'تعذر تحميل الاعتماد' : !ready ? 'جارٍ تحميل حالة الاعتماد' : completed ? 'مكتملة' : 'بانتظار اكتمال الهدف'}</p>
  </section>;
}
