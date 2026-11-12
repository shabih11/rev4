import { RewardAmount } from './RewardAmount';
import { useId, useState } from 'react';
import { Award, ChevronLeft, ChevronRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { Tier } from '../lib/employeeFeatures';
import { employeeAchievementEvidence, missionGrades, type employeeMissions } from '../lib/employeeMissions';
import type { UserAccount } from '../lib/mockData';
import { supabase } from '../lib/supabase';
import { AchievementBadge } from './AchievementBadge';
import { AvatarImage } from './AvatarImage';
import { TierAward } from './TierAward';

type Progress = ReturnType<typeof employeeMissions>;

const badgeDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh',
});
const tierLabels = { bronze: 'البرونزية', silver: 'الفضية', gold: 'الذهبية' };

export function EmployeeAchievementRow({ employeeId, progress, tier }: { employeeId: string; progress?: Progress; tier?: Tier }) {
  const { reviewSummaries, users } = useData();
  const [selected, setSelected] = useState<string>();
  const detailsId = useId();
  if (!progress && !tier) return null;
  const badges = new Map(progress?.missions.map(mission => [mission.id, {
    title: `${mission.title} · الدرجة ${missionGrades[mission.band ?? 0]}`, progress: mission.current / mission.target, band: mission.band ?? 0,
  }]));
  for (const badge of progress?.achievements ?? []) {
    if (!badges.has(badge.id)) badges.set(badge.id, { title: `${badge.title} · الدرجة ${missionGrades[badge.band]}`, progress: 1, band: badge.band });
  }
  const achievement = progress?.achievements.findLast(badge => badge.id === selected);
  const evidence = achievement && progress && employeeAchievementEvidence(employeeId, reviewSummaries, achievement, progress.today);
  const partners = evidence?.members.filter(id => id !== employeeId)
    .map(id => users.find(user => user.id === id)?.name).filter(Boolean) ?? [];
  const title = selected === 'tier' && tier ? tierLabels[tier] : badges.get(selected ?? '')?.title;
  const toggle = (id: string) => setSelected(previous => previous === id ? undefined : id);
  const badgeButton = 'grid size-11 shrink-0 place-items-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 aria-expanded:bg-blue-50 sm:size-12 [&>img]:size-9 sm:[&>img]:size-10 [&_svg]:!size-9 sm:[&_svg]:!size-10';

  return <section aria-label="شارات الموظفة" className="border-b border-blue-100 bg-white px-4 py-2 sm:px-6">
    <div className="flex items-center gap-1 overflow-x-auto sm:gap-2" style={{ justifyContent: "safe center" }}>
      {tier && <button type="button" className={badgeButton} aria-label={tierLabels[tier]} aria-expanded={selected === 'tier'} aria-controls={detailsId} onClick={() => toggle('tier')}>
        {tier === 'bronze' ? <Award aria-hidden="true" className="text-amber-700" /> : <TierAward gold={tier === 'gold'} iconOnly />}
      </button>}
      {[...badges].map(([id, badge]) => <button key={id} type="button" className={badgeButton} aria-label={badge.title} aria-expanded={selected === id} aria-controls={detailsId} onClick={() => toggle(id)}>
        <AchievementBadge missionId={id} progress={badge.progress} band={badge.band} />
      </button>)}
    </div>
    <div id={detailsId} hidden={!title} className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-950">
      <p className="font-bold">{title}</p>
      {selected === 'daily-two' && !evidence && <p>تتجدد هذه الشارة يوميًا بتوقيت الرياض. تبدأ بالتلوّن بعد أول تقييم إيجابي اليوم، وتكتمل الدرجة الخضراء بتقييمين ثم تبدأ الدرجة الزرقاء. التقييمات السابقة لا تدخل في تقدم اليوم.</p>}
      {evidence && <p className="mt-1 text-xs text-slate-700">
        <time dateTime={evidence.day}>{badgeDate.format(new Date(`${evidence.day}T12:00:00+03:00`))}</time>
        {partners.length > 0 && `، مع ${partners.join('، ')}`}
      </p>}
    </div>
  </section>;
}

export function EmployeeAvatarStack({ employee }: { employee: UserAccount }) {
  const { features, currentAccount } = useData();
  const [viewedId, setViewedId] = useState<string>();
  const [equippedId, setEquippedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const store = features?.settings.avatars ? features.store : null;
  const own = currentAccount?.id === employee.id;
  const owned = store?.collections.flatMap(collection => collection.variants.filter(variant => variant.ownerId === employee.id && store?.monthActive !== false)) ?? [];
  const activePath = store?.equipped[employee.id] ?? null;
  const active = owned.find(avatar => avatar.id === equippedId) ?? owned.find(avatar => avatar.imagePath === activePath);
  const primary = active ?? { id: '', name: employee.name, imagePath: activePath };
  const stack = [primary, ...owned.filter(avatar => avatar.id !== primary.id)];
  const index = Math.max(0, stack.findIndex(avatar => avatar.id === viewedId));
  const visible = stack[index];
  const behind = Array.from({ length: Math.min(2, stack.length - 1) },
    (_, position) => stack[(index + position + 1) % stack.length]);

  async function equip(variant: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('equip_avatar', { variant });
      if (error) throw error;
      setEquippedId(variant);
      setViewedId(undefined);
      window.dispatchEvent(new Event('rev4-cache-changed'));
      setMessage('تم تحديث الأفاتار.');
    } catch {
      setMessage('تعذر اختيار الأفاتار. حاولي مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  const arrowStyle = 'grid size-11 shrink-0 place-items-center rounded-full border border-blue-100 bg-white text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-600';
  return <section aria-label="مجموعة أفاتارات الموظفة" className="min-w-0 text-center">
    <div className="relative isolate mx-auto h-[clamp(180px,32svh,300px)] max-w-52">
      {behind.map((avatar, position) => <div key={avatar.id} aria-hidden="true" className={`pointer-events-none absolute inset-y-3 left-[15%] right-[15%] origin-bottom opacity-45 ${position === 0 ? '-translate-x-6 -rotate-6' : 'translate-x-6 rotate-6'}`}>
        <AvatarImage path={avatar.imagePath} alt="" className="h-full w-full object-contain" />
      </div>)}
      <div className="relative z-10 h-full">
        <AvatarImage path={visible.imagePath} alt={visible.name} className="h-full w-full object-contain" />
      </div>
    </div>
    {stack.length > 1 && <div className="mt-2 flex items-center justify-center gap-1 sm:gap-2">
      <button type="button" aria-label="الأفاتار السابق" className={arrowStyle} onClick={() => setViewedId(stack[(index - 1 + stack.length) % stack.length].id)}><ChevronRight aria-hidden="true" size={18} /></button>
      <p aria-live="polite" className="min-w-0 break-words text-xs font-bold text-slate-800">{visible.name}</p>
      <button type="button" aria-label="الأفاتار التالي" className={arrowStyle} onClick={() => setViewedId(stack[(index + 1) % stack.length].id)}><ChevronLeft aria-hidden="true" size={18} /></button>
    </div>}
    {index > 0 && own && <button type="button" disabled={busy} onClick={() => void equip(visible.id)} className="mt-2 min-h-11 rounded-lg border border-blue-200 px-2 text-xs font-bold text-blue-800 disabled:opacity-50">استخدام الأفاتار</button>}
    {own && store?.wallet && <p className="mt-2 text-xs font-bold text-amber-800"><RewardAmount kind="coins" value={store.wallet.available} /></p>}
    {message && <p role="status" className="mt-2 text-xs text-blue-800">{message}</p>}
  </section>;
}
