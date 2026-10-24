import { useId } from 'react';
import type { Tier } from '../lib/employeeFeatures';
import goldGem from '../assets/gold-gem.png';
export function FacetedGem({ tier }: { tier: Exclude<Tier, 'bronze'> }) {
  const id = useId();
  const gold = tier === 'gold';
  if (gold) return <img src={goldGem} alt="" aria-hidden="true" className="faceted-gem gem-gold gem-gold-image" />;
  return <svg viewBox="0 0 60 76" className={`faceted-gem gem-${tier}`} aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={gold ? '#fff7c2' : '#fafbfc'} /><stop offset=".45" stopColor={gold ? '#e3bc4e' : '#c6cbd2'} /><stop offset="1" stopColor={gold ? '#805311' : '#505966'} /></linearGradient></defs>
    <path d="M30 12 51 32 52 43 30 67 8 43 9 32Z" fill={`url(#${id})`} stroke={gold ? '#a9781f' : '#737d89'} strokeWidth="1" />
    <path d="M30 12 19 31 30 25 41 31Z" fill={gold ? '#fff7bf' : '#f9fafc'} />
    <path d="M9 32 19 31 14 42 8 43Z" fill={gold ? '#f1d77d' : '#d6dbe1'} />
    <path d="M30 25 19 31 30 42 41 31Z" fill={gold ? '#ffe9a1' : '#e9edf1'} />
    <path d="M19 31 14 42 30 42Z" fill={gold ? '#c99e38' : '#b1bac5'} />
    <path d="M41 31 46 42 30 42Z" fill={gold ? '#bd8b28' : '#8995a4'} />
    <path d="M51 32 41 31 46 42 52 43Z" fill={gold ? '#f5df95' : '#e0e5eb'} />
    <path d="M8 43 14 42 30 67Z" fill={gold ? '#9b6b18' : '#66717e'} />
    <path d="M14 42 30 42 30 67Z" fill={gold ? '#e5be56' : '#c1cad4'} />
    <path d="M30 42 46 42 30 67Z" fill={gold ? '#c7922c' : '#959fac'} />
    <path d="M46 42 52 43 30 67Z" fill={gold ? '#7d5314' : '#4d5867'} />
    <path className="gem-glint" d="m30 2 1.5 8L38 12l-6.5 2L30 22l-1.5-8L22 12l6.5-2Z M49 20l.8 4 3.2.8-3.2.8-.8 4-.8-4-3.2-.8 3.2-.8Z M12 19l.6 2.5 2.4.6-2.4.6L12 25l-.6-2.3-2.4-.6 2.4-.6Z" fill={gold ? '#fff8d3' : '#fff'} stroke={gold ? '#d7b454' : '#d2d6dc'} strokeWidth=".4" />
    <path d="m30 68 .7 3.2L34 72l-3.3.8L30 76l-.7-3.2L26 72l3.3-.8Z" fill={gold ? '#b3852b' : '#929ca8'} />
  </svg>;
}
