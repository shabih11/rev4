import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef } from 'react';
import { goldBetweenSlides, makeSceneryMesh, polygonFill, sceneryOffset } from '../lib/polygonScenery';
export interface SceneryHandle { move: (position: number, duration: number) => void }
export const LeaderboardScenery = forwardRef<SceneryHandle, { goldSlides: boolean[]; reduceMotion: boolean }>(function LeaderboardScenery({ goldSlides, reduceMotion }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  const polygons = useRef<(SVGPolygonElement | null)[]>([]);
  const position = useRef(0);
  const frame = useRef(0);
  const sheen = useRef<SVGRectElement>(null);
  const sheenId = useId();
  const mesh = useMemo(() => makeSceneryMesh(goldSlides.length), [goldSlides.length]);
  const vertices = useMemo(() => mesh.map(cell => cell.points.split(' ').map(point => point.split(',').map(Number))), [mesh]);
  const paint = useCallback((value: number) => {
    position.current = value;
    const offset = sceneryOffset(value), gold = goldBetweenSlides(value, goldSlides);
    svg.current?.setAttribute('viewBox', `${offset} 0 1350 1050`);
    svg.current?.parentElement?.style.setProperty('--scenery-gold', String(gold));
    mesh.forEach((cell, index) => {
      const polygon = polygons.current[index];
      if (!polygon) return;
      polygon.setAttribute('fill', polygonFill(index, cell.x, cell.y, offset, gold));
      // Shared vertices move together, keeping the crystal facets joined.
      polygon.setAttribute('points', reduceMotion ? cell.points : vertices[index].map(([x, y]) => {
        const envelope = Math.sin(Math.PI * y / 1050);
        const wave = Math.sin(x / 240 - value * Math.PI * 2 + y / 350);
        return `${x},${y + 22 * envelope * wave}`;
      }).join(' '));
      const glint = reduceMotion ? 0 : Math.max(0, Math.cos((cell.x - offset) / 200 + cell.y / 300 - value * Math.PI * 2)) ** 12;
      polygon.setAttribute('stroke', `rgba(190,210,231,${glint * .55})`);
      polygon.setAttribute('stroke-width', '1.2');
    });
    sheen.current?.setAttribute('x', String(offset - 700 + (Math.sin(value * Math.PI * 2) + 1) * 900));
  }, [mesh, vertices, goldSlides, reduceMotion]);
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
    <defs><linearGradient id={sheenId}><stop stopColor="#b8ddff" stopOpacity="0"/><stop offset=".4" stopColor="#d5c8f5" stopOpacity=".12"/><stop offset=".5" stopColor="#fff" stopOpacity=".65"/><stop offset=".6" stopColor="#bdece9" stopOpacity=".16"/><stop offset="1" stopColor="#b8ddff" stopOpacity="0"/></linearGradient></defs>
    <rect x="-100" y="0" width={1450 + goldSlides.length * 420} height="1050" fill="#fff"/>
    {mesh.map((cell, index) => <polygon key={index} ref={element => { polygons.current[index] = element; }} points={cell.points} fill={polygonFill(index, cell.x, cell.y, 0, Number(goldSlides[0]))}/>)}
    {!reduceMotion && <rect ref={sheen} x="200" y="0" width="700" height="1050" fill={`url(#${sheenId})`} />}
  </svg></div>;
});
