import { useId } from 'react';

// Four interlocking petals and the full blue / gold palette of the reference.
export function AchievementBadge({ band = 0, earned = false, shape = 0 }: { band?: number; earned?: boolean; shape?: number }) {
  const id = useId();
  const gold = earned && band >= 2;
  const colors = !earned ? ['#cbd5e1', '#94a3b8', '#e2e8f0'] : gold ? ['#ffe98b', '#ffcb16', '#ffb900'] : ['#9bc8ff', '#589dff', '#2176ef'];
  return <svg viewBox="0 0 100 100" className="h-14 w-14 shrink-0" aria-hidden="true">
    <defs>{colors.map((color, i) => <linearGradient key={i} id={`${id}-${i}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={color}/><stop offset="1" stopColor={colors[(i + 1) % colors.length]}/></linearGradient>)}</defs>
    <g transform={`rotate(${shape * 15} 50 50)`}>{[0, 90, 180, 270].map((angle, i) => <path key={angle} transform={`rotate(${angle} 50 50)`} d={shape % 2 ? 'M48 47C17 49 6 29 16 15C32 0 50 15 48 47Z' : 'M47 47H26C4 47 3 15 24 8C45 1 49 21 47 47Z'} fill={`url(#${id}-${i % 3})`}/>)}</g>
    {earned && <circle cx="50" cy="50" r={band + 2} fill={gold ? '#ffb900' : '#2176ef'}/>}
  </svg>;
}
