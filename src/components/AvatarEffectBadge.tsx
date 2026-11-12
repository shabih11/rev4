import { useData } from '../context/DataContext';
import { monthOf } from '../lib/avatarPrivileges';

export function AvatarEffectIcon({ gold = true }: { gold?: boolean }) {
  return <svg role="img" aria-label={gold ? 'إنقاذ أم خماس' : 'إنقاذ الأفتار'} viewBox="0 0 40 40" className="inline-block size-7 shrink-0 align-middle">
    <path d="M8 9Q20 1 32 9L30 34 20 29 10 34Z" fill={gold ? '#ba8a23' : '#64748b'} stroke={gold ? '#76520c' : '#334155'} strokeWidth="1.5" />
    <path d="M10 13Q15 10 19 14L18 18Q13 19 10 16ZM21 14Q25 10 30 13L30 16Q27 19 22 18Z" fill="#171717" />
    <path d="M20 9V27M12 24Q20 29 28 24" fill="none" stroke="#fff0b0" strokeWidth="1.5" />
  </svg>;
}
export function AvatarEffectBadge({ employeeId, reviewId }: { employeeId: string; reviewId?: string }) {
  const { avatarPrivileges, resultsDate, users } = useData();
  const effects = avatarPrivileges?.uses.filter(use => use.period === monthOf(resultsDate) && use.recipients.includes(employeeId) && (!reviewId || use.reviewId === reviewId)) ?? [];
  if (!effects.length) return null;
  return <span className="inline-flex flex-wrap items-center gap-1 text-xs font-bold text-amber-900" aria-label="أثر امتياز الأفتار">
    <AvatarEffectIcon gold={effects.some(effect => effect.gold)} />
    {effects.map(effect => <span key={effect.id}>{effect.kind === 'erase' ? 'أُلغي أثر تقييم سلبي' : 'اكتمل الاستحقاق'} بواسطة {effect.gold ? 'أم خماس' : 'الأفتار'}{effect.actor !== employeeId ? ` · ${users.find(user => user.id === effect.actor)?.name || 'زميلة الفرع'}` : ''}</span>)}
  </span>;
}
