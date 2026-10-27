import { useEffect, useId, useRef } from 'react';
import type { Tier } from '../lib/employeeFeatures';

export function CrystalPlatform({ visible, tier, reduceMotion }: { visible: boolean; tier: Tier; reduceMotion: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = stage.current?.getBoundingClientRect().top ?? 0;
        stage.current?.style.setProperty('--crystal-scroll', String(Math.max(0, Math.min(1, 1 - top / window.innerHeight))));
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('scroll', update); cancelAnimationFrame(frame); };
  }, [reduceMotion]);
  return <div ref={stage} className="crystal-stage crystal-stage-fixed" data-tier={tier} data-visible={visible} aria-hidden="true">
    <div className="crystal-platform" aria-hidden="true">
      <div className="crystal-halo" />
      <svg viewBox="0 0 600 160" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-edge`} x2="0" y2="1"><stop stopColor="#fff"/><stop offset=".2" stopColor="#c6e6ff"/><stop offset=".48" stopColor="#f7fbff"/><stop offset=".72" stopColor="#718ba8"/><stop offset="1" stopColor="#fff"/></linearGradient>
          <radialGradient id={`${id}-top`}><stop stopColor="#f8fbff"/><stop offset=".32" stopColor="#fff"/><stop offset=".55" stopColor="#dcecf8"/><stop offset=".72" stopColor="#f5fbff"/><stop offset=".94" stopColor="#e5edf4"/><stop offset="1" stopColor="#fff"/></radialGradient>

        </defs>
        <path d="M20 55a280 48 0 0 0 560 0v18a280 48 0 0 1-560 0Z" fill={`url(#${id}-edge)`} stroke="var(--crystal-color)" strokeWidth="1.5"/>
        <ellipse cx="300" cy="55" rx="280" ry="48" fill={`url(#${id}-top)`} stroke="#fff" strokeWidth="2"/>
        <path d="M20 74a280 48 0 0 0 560 0" fill="none" stroke="var(--crystal-color)" strokeWidth="3" className="crystal-rim"/>
        <path d="M30 78a270 44 0 0 0 540 0" fill="none" stroke="#fff" strokeWidth="2"/>
      </svg>
      <div className="crystal-sheen" />
    </div>
  </div>;
}
