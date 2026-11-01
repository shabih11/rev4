import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { UserAccount } from '../lib/mockData';
import type { EmployeeReward } from '../lib/employeeRewards';
import { podiumHeight, podiumWidth, zoomPodiumAtPoint } from '../lib/podiumZoom';
import './ResultsPodium.css';

interface Props {
  employees: UserAccount[];
  rewards: Record<string, EmployeeReward> | null;
  period: Date;
  renderAvatar: (employee: UserAccount) => ReactNode;
  renderEmployee: (employee: UserAccount, front: ReactNode) => ReactNode;
}

// The same block dimensions are used at every rank. Position, rather than
// platform height, makes the pyramid: 4/3/2/1/2/3/4 from the back to the front.
const positions = [
  { rank: 7, x: 0, y: 0 }, { rank: 5, x: 169, y: 60 },
  { rank: 3, x: 338, y: 120 }, { rank: 1, x: 507, y: 180 },
  { rank: 2, x: 676, y: 120 }, { rank: 4, x: 845, y: 60 },
  { rank: 6, x: 1014, y: 0 },
];
const confetti = Array.from({ length: 84 }, (_, index) => ({
  x: 6 + ((index * 47) % 88),
  drift: ((index * 31) % 241) - 120,
  rise: 180 + ((index * 53) % 220),
  turn: 180 + ((index * 73) % 540),
  color: ['#ee5a95', '#37cdb4', '#eab953', '#8b80e8', '#6cbce0'][index % 5],
}));

export function ResultsPodium({ employees, rewards, period, renderAvatar, renderEmployee }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [zoom, setZoom] = useState(1);
  const zoomValue = useRef(1);
  const pendingScroll = useRef<{ scrollLeft: number; scrollTop: number } | null>(null);
  const [celebrating, setCelebrating] = useState(true);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setCelebrating(false), 1250);
    return () => window.clearTimeout(timer);
  }, []);
  const fit = Math.min(1, Math.max(0.1, (width - 24) / podiumWidth));
  const scale = fit * zoom;
  useLayoutEffect(() => {
    if (!viewport.current || !pendingScroll.current) return;
    viewport.current.scrollLeft = pendingScroll.current.scrollLeft;
    viewport.current.scrollTop = pendingScroll.current.scrollTop;
    pendingScroll.current = null;
  }, [zoom]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    let suppressClickUntil = 0;
    let pinch: { distance: number; zoom: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;
    let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    const apply = (target: ReturnType<typeof zoomPodiumAtPoint>) => {
      if (target.zoom === zoomValue.current) {
        node.scrollLeft = target.scrollLeft; node.scrollTop = target.scrollTop;
      } else {
        pendingScroll.current = target;
        zoomValue.current = target.zoom;
        setZoom(target.zoom);
      }
    };
    const at = (nextZoom: number, x: number, y: number) => apply(zoomPodiumAtPoint({ width: node.clientWidth, fit, zoom: zoomValue.current, nextZoom, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop, x, y }));
    const wheel = (event: WheelEvent) => {
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      const next = Math.max(1, Math.min(6, zoomValue.current * Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.0025)));
      if (next === zoomValue.current && !event.ctrlKey) return;
      event.preventDefault();
      const box = node.getBoundingClientRect();
      at(next, event.clientX - box.left, event.clientY - box.top);
    };
    const touchPoint = (touches: TouchList) => {
      const box = node.getBoundingClientRect();
      return { distance: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY), x: (touches[0].clientX + touches[1].clientX) / 2 - box.left, y: (touches[0].clientY + touches[1].clientY) / 2 - box.top };
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) { pinch = null; return; }
      event.preventDefault();
      pinch = { ...touchPoint(event.touches), zoom: zoomValue.current, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop };
      suppressClickUntil = performance.now() + 350;
    };
    const touchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2 || pinch.distance === 0) return;
      event.preventDefault();
      const point = touchPoint(event.touches);
      apply(zoomPodiumAtPoint({ width: node.clientWidth, fit, ...pinch, nextZoom: pinch.zoom * point.distance / pinch.distance, nextX: point.x, nextY: point.y }));
      suppressClickUntil = performance.now() + 350;
    };
    const touchEnd = () => { if (pinch) suppressClickUntil = performance.now() + 350; pinch = null; };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop, moved: false };
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { drag = null; return; }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      node.setPointerCapture(event.pointerId);
      node.scrollLeft = drag.left - dx; node.scrollTop = drag.top - dy;
      suppressClickUntil = performance.now() + 350;
    };
    const pointerEnd = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      if (drag.moved) suppressClickUntil = performance.now() + 350;
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      drag = null;
    };
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    const key = (event: KeyboardEvent) => {
      if (event.target !== node || !['+', '=', '-', '_', '0', '٠'].includes(event.key)) return;
      event.preventDefault();
      at(['0', '٠'].includes(event.key) ? 1 : zoomValue.current * (['+', '='].includes(event.key) ? 1.25 : 0.8), node.clientWidth / 2, node.clientHeight / 2);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    node.addEventListener('touchstart', touchStart, { passive: false });
    node.addEventListener('touchmove', touchMove, { passive: false });
    node.addEventListener('touchend', touchEnd); node.addEventListener('touchcancel', touchEnd);
    node.addEventListener('pointerdown', pointerDown); node.addEventListener('pointermove', pointerMove);
    node.addEventListener('pointerup', pointerEnd); node.addEventListener('pointercancel', pointerEnd);
    node.addEventListener('click', click, true); node.addEventListener('keydown', key);
    return () => {
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('touchstart', touchStart); node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('touchend', touchEnd); node.removeEventListener('touchcancel', touchEnd);
      node.removeEventListener('pointerdown', pointerDown); node.removeEventListener('pointermove', pointerMove);
      node.removeEventListener('pointerup', pointerEnd); node.removeEventListener('pointercancel', pointerEnd);
      node.removeEventListener('click', click, true); node.removeEventListener('keydown', key);
    };
  }, [fit]);
  const monthLabel = period.toLocaleDateString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', month: 'long' });
  const money = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });

  return <main className="results-podium" aria-label="منصة الأوائل السبع" dir="rtl">
    <div className="results-spotlights" aria-hidden="true"><i /><i /><i /><i /></div>
    {celebrating && <div className="results-confetti" aria-hidden="true">{confetti.map((piece, index) => <i key={index} style={{ '--piece-x': `${piece.x}%`, '--piece-drift': `${piece.drift}px`, '--piece-rise': `${-piece.rise}px`, '--piece-turn': `${piece.turn}deg`, '--piece-color': piece.color } as CSSProperties} />)}</div>}
    <header className="results-podium-heading">
      <span className="results-podium-eyebrow"><Trophy size={17} aria-hidden="true" /> نتائج {monthLabel}</span>
      <h1>منصة الأوائل</h1>
    </header>
    <p id="results-podium-help" className="sr-only">قرّبي بإصبعين أو بعجلة الفأرة، واسحبي لقراءة التفاصيل. بلوحة المفاتيح استخدمي + و- للتقريب و٠ لإظهار الكل.</p>
    <div ref={viewport} className="results-podium-viewport" style={{ height: Math.max(240, podiumHeight * fit + 32) }} tabIndex={0} role="region" aria-label="منصة ترتيب قابلة للتكبير والتمرير" aria-describedby="results-podium-help">
      <div className="results-podium-scroll-space" style={{ width: Math.max(width, podiumWidth * scale + 24), height: podiumHeight * scale + 32 }}>
        <ol className="results-podium-scene" style={{ transform: `scale(${scale})` }} aria-label="ترتيب الأوائل حسب رصيد التقييمات">
          {[...positions].sort((a, b) => a.rank - b.rank).map(position => {
            const employee = employees[position.rank - 1];
            const reward = employee ? rewards?.[employee.id] : undefined;
            const front = <div className="results-platform-front" data-tier={reward?.tier || 'bronze'}>
              <span className="results-platform-name" style={{ fontSize: employee ? Math.max(8, Math.min(13, 225 / (employee.name.length + 3))) : undefined }}><bdi dir="ltr">{position.rank.toLocaleString('ar-SA')}.</bdi>{' '}{employee?.name || 'لا توجد موظفة'}</span>
              <span className="results-platform-branch" style={{ fontSize: employee ? Math.max(8, Math.min(11, 210 / employee.branch.length)) : undefined }}>{employee?.branch || '—'}</span>
              <span className="results-platform-reward">{employee ? reward ? `${money(reward.total)} ريال` : 'المكافأة غير متاحة' : '—'}</span>
            </div>;
            return <li key={position.rank} className="results-platform" style={{ left: position.x, top: position.y, zIndex: position.y + 1 }} data-rank={position.rank}>
              <div className="results-platform-avatar">{employee && renderAvatar(employee)}</div>
              <div className="results-platform-block">
                <div className="results-platform-top" aria-hidden="true" />
                <div className="results-platform-side" aria-hidden="true" />
                <div className="results-platform-face">{employee ? renderEmployee(employee, front) : front}</div>
              </div>
            </li>;
          })}
        </ol>
      </div>
    </div>
  </main>;
}
