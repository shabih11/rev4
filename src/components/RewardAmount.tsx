import { formatRewardAmount } from '../lib/formatRewardAmount';

type RewardKind = 'stars' | 'coins';

export function RewardIcon({ kind, className = 'size-[1.15em]' }: { kind: RewardKind; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0`}>
    {kind === 'stars' ? <>
      <path fill="#2563eb" d="m12 1.7 3.15 6.38 7.04 1.02-5.09 4.96 1.2 7.01L12 17.76l-6.3 3.31 1.2-7.01L1.81 9.1l7.04-1.02z"/>
      <path fill="#93c5fd" d="m12 1.7-.05 10.55-5.05 1.81-5.09-4.96 7.04-1.02z"/>
      <path fill="#60a5fa" d="m11.95 12.25 5.15 1.81 1.2 7.01L12 17.76l-6.3 3.31z"/>
    </> : <>
      <path fill="#b76b09" d="M2.5 14.5h19v4.3c0 2-4.25 3.7-9.5 3.7s-9.5-1.7-9.5-3.7z"/>
      <ellipse cx="12" cy="14.5" rx="9.5" ry="3.6" fill="#f8bd3e"/>
      <path fill="#d48b13" d="M2.5 9h19v4.3c0 2-4.25 3.7-9.5 3.7s-9.5-1.7-9.5-3.7z"/>
      <ellipse cx="12" cy="9" rx="9.5" ry="3.6" fill="#ffd263"/>
      <path fill="#edab2f" d="M2.5 4.4h19v3.7c0 2-4.25 3.7-9.5 3.7s-9.5-1.7-9.5-3.7z"/>
      <ellipse cx="12" cy="4.4" rx="9.5" ry="3.5" fill="#ffe081"/>
      <ellipse cx="12" cy="4.4" rx="6.3" ry="2" fill="none" stroke="#d99119" strokeWidth=".8"/>
    </>}
  </svg>;
}

export function RewardAmount({ kind, value }: { kind: RewardKind; value: number | string }) {
  const amount = typeof value === 'number' ? formatRewardAmount(value) : value;
  return <span className="inline-flex items-center gap-1 whitespace-nowrap align-middle">
    <RewardIcon kind={kind} />
    <bdi dir="ltr">{amount}</bdi>
    <span className="sr-only"> {kind === 'coins' ? 'عملة' : 'نجمة'}</span>
  </span>;
}

export function MissionRewards({ stars, coins }: { stars: number; coins: number }) {
  return <span className="ms-auto inline-flex shrink-0 flex-col items-end gap-1 text-xs font-bold tabular-nums text-slate-800 sm:flex-row sm:gap-3">
    <RewardAmount kind="stars" value={`+${stars.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })}`} />
    <RewardAmount kind="coins" value={`+${coins.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })}`} />
  </span>;
}
