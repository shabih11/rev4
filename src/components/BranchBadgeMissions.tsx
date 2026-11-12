import { MissionRewards, RewardAmount } from './RewardAmount';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useData, type BranchBadgeReward } from '../context/DataContext';
import { riyadhDay } from '../lib/employeeFeatures';
import { isPositiveReview, isInCurrentMonth } from '../lib/reviewPeriod';
import { supabase } from '../lib/supabase';

const badges = {
  coffee: { name: 'قهوة الأحد', image: 'sunday-coffee.png', target: 'الفوز في تحدي قهوة الأحد' },
  rocket: { name: 'الانطلاق الصاروخي', image: 'rocket-launch.png', target: '١٠٠ تقييم للفرع خلال أسبوع' },
  milestone500: { name: '٥٠٠ تقييم', image: 'branch-500-reviews.png', target: '٥٠٠ تقييم تراكمي للفرع' },
  milestone: { name: 'ألف تقييم', image: 'branch-1000-reviews.png', target: '١٬٠٠٠ تقييم تراكمي للفرع' },
} satisfies Record<BranchBadgeReward['badge'], { name: string; image: string; target: string }>;
const badgeIds = Object.keys(badges) as BranchBadgeReward['badge'][];

export function BranchBadgeMissions({ branch, employeeId }: { branch: string; employeeId: string }) {
  const { reviewSummaries, branchBadgeRewards, coverageBranches } = useData();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  const weekday = new Date(`${riyadhDay(now)}T12:00:00Z`).getUTCDay();
  const month = riyadhDay(now).slice(0, 7);
  const missionBranch = coverageBranches[employeeId] || branch;
  if (!missionBranch || missionBranch === 'موظفة خارجية') return null;
  const contributions = reviewSummaries.filter(review => review.branch === missionBranch && isPositiveReview(review.rating) && review.linkedEmployeeIds.includes(employeeId));
  const monthly = contributions.filter(review => isInCurrentMonth(review.date, now)).length;
  return <section aria-label="مهام الفرع" className="mx-6 mb-6 rounded-3xl border border-slate-200 bg-white p-5">
    <h2 className="text-xl font-black text-slate-800">مهام الفرع · {missionBranch}</h2>
    <ul className="mt-3 space-y-3">{badgeIds.map(id => {
      const badge = badges[id];
      const approved = branchBadgeRewards.some(reward => reward.branch === missionBranch && reward.badge === id && ((id === 'milestone' || id === 'milestone500') || reward.period.startsWith(month)));
      const count = monthly;
      if (id === 'coffee' && !approved && (weekday === 1 || weekday === 2)) return null;
      const startsTomorrow = id === 'coffee' && weekday === 3 && !approved;
      return <li key={id} className={`flex items-center gap-3 rounded-xl border p-3 ${approved ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
        <img src={`${import.meta.env.BASE_URL}badges/${badge.image}`} alt="" className="h-12 w-12 object-contain" />
        <div>
          <h3 className="font-bold text-slate-900">{badge.name}</h3>
          {approved && <p className="flex items-center gap-1 text-xs font-bold text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" />تم اكتساب المكافأة</p>}
          {startsTomorrow && <p className="text-sm font-bold text-slate-700">تبدأ غدًا</p>}
          {id === 'milestone' || id === 'milestone500' ? <p className="text-sm">عند الوصول إلى {id === 'milestone500' ? '٥٠٠' : '١٠٠٠'} تقييم في خرائط قوقل</p> : <>
            <p className="text-sm">{badge.target}</p>
            {!startsTomorrow && <p className="text-xs text-slate-700">مساهمتك {Math.min(count, 5)} / ٥</p>}
          </>}
        </div>
        {id === 'milestone' || id === 'milestone500' ? <RewardAmount kind="coins" value={id === 'milestone' ? 10000 : 1000} /> : <MissionRewards stars={id === 'rocket' ? 480 : 100} coins={id === 'rocket' ? 500 : 125} />}
      </li>;
    })}</ul>
  </section>;
}

export function BranchBadgeRewardsAdmin() {
  const { branchSettings, users } = useData();
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [badge, setBadge] = useState<'milestone' | 'milestone500'>('milestone');
  const branchEmployees = users.filter(user => user.role === 'employee' && user.branch === branch);
  const coins = badge === 'milestone' ? 10000 : 1000;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  return <form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={async event => {
    event.preventDefault();
    if (!branch || !selectedEmployees.length || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('approve_branch_badge_reward', { requested_branch: branch, requested_badge: badge, requested_employee_ids: selectedEmployees });
      setStatus(error ? 'تعذّر اعتماد المكافأة. تحققي من الصلاحية والفرع والموظفات المحددات.' : 'اعتُمدت المكافأة للموظفات المحددات فقط.');
      if (!error) window.dispatchEvent(new Event('rev4-cache-changed'));
    } catch {
      setStatus('تعذّر الاتصال لحفظ الاعتماد. حاولي مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }}>
    <h3 className="font-black">اعتماد مكافآت شارات الفروع</h3>
    <p className="text-sm">هذا الاختيار هو الطريقة الوحيدة لاعتماد شارات ٥٠٠ وألف تقييم؛ لا يشترط عدد التقييمات المسجّل في النظام. قهوة الأحد والانطلاق الصاروخي ومهمة البحر تُكتسب تلقائيًا بحسب شروطها.</p>
    <label className="block">الشارة
      <select disabled={busy} value={badge} onChange={event => { setBadge(event.target.value as typeof badge); setSelectedEmployees([]); setStatus(''); }} className="mr-2 rounded-lg border p-2">
        <option value="milestone500">٥٠٠ تقييم · ١٬٠٠٠ عملة فقط</option>
        <option value="milestone">ألف تقييم · ١٠٬٠٠٠ عملة فقط</option>
      </select>
    </label>
    <fieldset disabled={busy} className="space-y-2">
      <legend className="font-bold">الفرع</legend>
      {Object.keys(branchSettings).sort().map(name => <label key={name} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <input required type="radio" name="reward-branch" value={name} checked={branch === name} onChange={() => { setBranch(name); setSelectedEmployees([]); setStatus(''); }} />
        <span>{name}</span>
        {branch === name && <span className="text-sm">المكافأة: <RewardAmount kind="coins" value={coins} /> فقط</span>}
      </label>)}
    </fieldset>
    {branch && <div role="status" className="rounded-xl bg-amber-50 p-4 space-y-2">
      <p className="font-bold">{branch} · {badges[badge].name}</p>
      <p className="text-sm">المكافأة لكل موظفة تختارينها أدناه:</p>
      <RewardAmount kind="coins" value={coins} /><p className="text-sm">عملات فقط، دون نجوم أو مكافآت إضافية.</p>
    </div>}
    {branch && <fieldset disabled={busy} className="space-y-2 rounded-xl border p-4">
      <legend className="font-bold">الموظفات المستفيدات</legend>
      <p className="text-sm text-slate-600">اختاري المستفيدات يدويًا. لا يُحدد أي اسم تلقائيًا ولا تُشترط مساهمة بعدد تقييمات.</p>
      {branchEmployees.length === 0 && <p className="text-sm">لا توجد موظفات في هذا الفرع.</p>}
      {branchEmployees.map(employee => <label key={employee.id} className="flex items-center gap-2 rounded-lg border p-3">
        <input type="checkbox" checked={selectedEmployees.includes(employee.id)} onChange={event => setSelectedEmployees(current => event.target.checked ? [...current, employee.id] : current.filter(id => id !== employee.id))} />
        <span>{employee.name}</span>
        {selectedEmployees.includes(employee.id) && <RewardAmount kind="coins" value={coins} />}
      </label>)}
      <p role="status" className="text-sm">المحددات: {selectedEmployees.length} · إجمالي العملات: <RewardAmount kind="coins" value={selectedEmployees.length * coins} /></p>
    </fieldset>}
    <button disabled={!branch || !selectedEmployees.length || busy} className="action-primary">{busy ? 'جارٍ الاعتماد…' : 'اعتماد مكافأة الشارة'}</button>
    {status && <p role="status" className="text-sm">{status}</p>}
  </form>;
}
