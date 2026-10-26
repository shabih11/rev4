import { useId } from 'react';
export function TierAward({ gold }: { gold: boolean }) {
  const gradient = useId();
  const label = gold ? 'متميزة' : 'خبيرة';
  return <span className={`tier-award ${gold ? 'tier-award-gold' : 'tier-award-silver'}`}>
    <svg viewBox="0 0 64 56" aria-hidden="true"><defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor={gold ? '#a96a05' : '#6e7c8d'}/><stop offset=".3" stopColor={gold ? '#ffda55' : '#e5edf7'}/><stop offset=".5" stopColor={gold ? '#fff2a5' : '#ffffff'}/><stop offset=".7" stopColor={gold ? '#e7ae1c' : '#b3c2d4'}/><stop offset="1" stopColor={gold ? '#ac7104' : '#718198'}/></linearGradient></defs><g fill={`url(#${gradient})`}><path d="M29 50C12 45 6 29 15 12l3 2C9 30 16 43 30 47Zm6 0c17-5 23-21 14-38l-3 2c9 16 2 29-12 33Z"/>
      <path d="M14 31C5 30 4 25 5 21c7 0 11 4 9 10Zm2 9C7 40 5 35 6 31c7 0 12 3 10 9Zm7 7c-9 3-13-1-14-6 7-2 12 0 14 6ZM14 21C7 17 8 12 11 8c6 3 7 8 3 13Z"/>
      <path d="M50 31c9-1 10-6 9-10-7 0-11 4-9 10Zm-2 9c9 0 11-5 10-9-7 0-12 3-10 9Zm-7 7c9 3 13-1 14-6-7-2-12 0-14 6Zm9-26c7-4 6-9 3-13-6 3-7 8-3 13ZM32 10l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z"/></g></svg>
    <span>{label}</span>
  </span>;
}
