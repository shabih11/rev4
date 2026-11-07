import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

export interface SceneryHandle { move: (position: number, duration: number) => void }

export const LeaderboardScenery = forwardRef<SceneryHandle, { goldSlides: boolean[]; reduceMotion: boolean }>(function LeaderboardScenery({ reduceMotion }, ref) {
  const glass = useRef<HTMLDivElement>(null);
  const position = useRef(0);
  const frame = useRef(0);
  const scrollOffset = useRef(0);
  const paint = useCallback((value: number) => {
    position.current = value;
    const phase = reduceMotion ? 0 : value * .9 + scrollOffset.current;
    const surface = glass.current?.closest<HTMLElement>('.recognition-composition');
    surface?.style.setProperty('--glass-light', `${50 + Math.sin(phase) * 32}%`);
    surface?.style.setProperty('--glass-angle', `${115 + Math.sin(phase) * 45}deg`);
    surface?.style.setProperty('--glass-intensity', String(.55 + Math.abs(Math.sin(phase)) * .35));
  }, [reduceMotion]);
  useImperativeHandle(ref, () => ({ move(target, duration) {
    cancelAnimationFrame(frame.current);
    if (reduceMotion || duration <= 0) { paint(target); return; }
    const start = position.current, began = performance.now();
    function step(now: number) {
      const elapsed = Math.min(1, (now - began) / duration);
      paint(start + (target - start) * (1 - (1 - elapsed) ** 3));
      if (elapsed < 1) frame.current = requestAnimationFrame(step);
    }
    frame.current = requestAnimationFrame(step);
  }}));
  useEffect(() => {
    let scrollFrame = 0;
    const update = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        scrollOffset.current = window.scrollY / Math.max(window.innerHeight, 1) * 2;
        paint(position.current);
      });
    };
    paint(position.current);
    if (!reduceMotion) window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(frame.current);
    };
  }, [reduceMotion, paint]);
  return <div ref={glass} className="valley-scenery smash-glass" aria-hidden="true">
    <div className="smash-glass-pane"><div className="smash-glass-reflection" /><div className="smash-glass-edge-light" /></div>
  </div>;
});
