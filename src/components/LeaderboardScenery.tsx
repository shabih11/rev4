import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { goldBetweenSlides, makeSceneryMesh, polygonFill, sceneryOffset } from '../lib/polygonScenery';
export interface SceneryHandle { move: (position: number, duration: number) => void }
export const LeaderboardScenery = forwardRef<SceneryHandle, { goldSlides: boolean[]; reduceMotion: boolean }>(function LeaderboardScenery({ goldSlides, reduceMotion }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  const polygons = useRef<(SVGPolygonElement | null)[]>([]);
  const position = useRef(0);
  const frame = useRef(0);
  const mesh = useMemo(() => makeSceneryMesh(goldSlides.length), [goldSlides.length]);
  const paint = useCallback((value: number) => {
    position.current = value;
    const offset = sceneryOffset(value), gold = goldBetweenSlides(value, goldSlides);
    svg.current?.setAttribute('viewBox', `${offset} 0 1350 1050`);
    svg.current?.parentElement?.style.setProperty('--scenery-gold', String(gold));
    mesh.forEach((cell, index) => polygons.current[index]?.setAttribute('fill', polygonFill(index, cell.x, cell.y, offset, gold)));
  }, [mesh, goldSlides]);
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
  useEffect(() => { paint(position.current); return () => cancelAnimationFrame(frame.current); }, [paint, reduceMotion]);
  return <div className="valley-scenery" aria-hidden="true"><svg ref={svg} viewBox="0 0 1350 1050" preserveAspectRatio="none">
    <rect x="-100" y="0" width={1450 + goldSlides.length * 420} height="1050" fill="#fff"/>
    {mesh.map((cell, index) => <polygon key={index} ref={element => { polygons.current[index] = element; }} points={cell.points} fill={polygonFill(index, cell.x, cell.y, 0, Number(goldSlides[0]))}/>)}
  </svg></div>;
});
