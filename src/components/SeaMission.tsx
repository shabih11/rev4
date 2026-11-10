import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { seaFleetLayout, type SeaFleetPosition } from '../lib/seaFleetLayout';
import { useData } from '../context/DataContext';
import { useSeaCompletions } from '../hooks/useSeaCompletions';
import { useRiyadhWeather } from '../hooks/useRiyadhWeather';
import { seaWeather, weatherAt, type RiyadhWeather } from '../lib/riyadhWeather';
import { seaMission, seaOpening, SEA_BRANCHES, type SeaBranch, type SeaCompletion } from '../lib/seaMission';
import { seaBranchClock, seaBranchScene, seaSceneBerths, seaLight, seaSunGlare, seaViewDistance, SEA_SCENE_LABELS } from '../lib/seaScene';
import { SEA_BACKDROPS, seaSceneAsset } from './seaSceneAssets';
import island from '../assets/sea/island-terrain-shore.webp';
import distantMobile from '../assets/sea/ocean-distant-mobile.webp';
import distantDesktop from '../assets/sea/ocean-distant-desktop.webp';
import distantNightMobile from '../assets/sea/ocean-distant-night-mobile.webp';
import distantNightDesktop from '../assets/sea/ocean-distant-night-desktop.webp';
import glareMobile from '../assets/sea/ocean-distant-glare-mobile.webp';
import glareDesktop from '../assets/sea/ocean-distant-glare-desktop.webp';
import boatWake from '../assets/sea/boat-wake.webp';
import waterContact from '../assets/sea/boat-water-contact.webp';
import './SeaMission.css';

const number = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const statusLabels: Record<SeaBranch['status'], string> = { waiting: 'لم تبدأ', sailing: 'مستمر', sunk: 'غرق', arrived: 'وصل', unverified: 'قيد التحقق' };
type SeaReview = Parameters<typeof seaMission>[0][number];

export function SeaMissionView({ reviews, now, weather = null, completions = [], ready = true, onApprove }: {
  reviews: readonly SeaReview[]; now: number; preferredBranch?: string; weather?: RiyadhWeather | null;
  completions?: readonly SeaCompletion[]; ready?: boolean; onApprove?: (branch: string, day: number) => Promise<void>;
}) {
  const mission = seaMission(reviews, now, completions);
  const [selected, setSelected] = useState('');
  const [approvalBranch, setApprovalBranch] = useState('');
  const lastTap = useRef<{ branch: string; time: number } | null>(null);
  const [showCapsized, setShowCapsized] = useState(false);
  const [busyBranch, setBusyBranch] = useState('');
  const [message, setMessage] = useState('');
  const branches = ready ? mission.branches : [];
  const capsized = branches.filter(branch => seaBranchScene(branch, now) === 'capsized');
  const capsizedScene = showCapsized && capsized.length > 0;
  const fleet = capsizedScene ? capsized : branches.filter(branch => !capsized.includes(branch));
  const light = seaLight(now);
  const distance = seaViewDistance(now);
  const glare = distance === 'distant' && seaSunGlare(now);
  const distantBackdrop = light === 'night'
    ? { mobile: distantNightMobile, desktop: distantNightDesktop }
    : glare ? { mobile: glareMobile, desktop: glareDesktop }
      : { mobile: distantMobile, desktop: distantDesktop };
  const backdrop = distance === 'distant' ? distantBackdrop : SEA_BACKDROPS[light];
  const atmosphere = seaWeather(weather);
  const berths = seaSceneBerths(fleet, now);
  const mapRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<SeaFleetPosition[]>([]);
  const layoutKey = berths.map(position => `${position.name}:${position.x}:${position.y}:${seaBranchScene(mission.branches.find(branch => branch.name === position.name)!, now)}`).join('|');
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const arrange = () => {
      const vessels = Array.from(map.querySelectorAll<HTMLLIElement>('.sea-fleet > li')).map(item => {
        const button = item.querySelector<HTMLButtonElement>('.sea-vessel')!;
        const scale = button.dataset.scene === 'rescue' ? .935 : 1.3;
        return { name: item.dataset.branch!, width: button.offsetWidth * scale, height: button.offsetHeight * scale,
          preferredX: parseFloat(item.style.getPropertyValue('--berth-x')) / 100,
          order: Number(item.dataset.order) };
      });
      const next = seaFleetLayout(vessels, map.clientWidth, map.clientHeight);
      for (const item of map.querySelectorAll<HTMLLIElement>('.sea-fleet > li')) {
        const position = next.find(vessel => vessel.name === item.dataset.branch);
        const button = item.querySelector<HTMLButtonElement>('.sea-vessel')!;
        item.style.setProperty('--vessel-rise', `${button.offsetHeight * 1.3 * (position?.fit ?? 1)}px`);
      }
      setLayout(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(map);
    map.addEventListener('load', arrange, true);
    return () => { observer.disconnect(); map.removeEventListener('load', arrange, true); };
  }, [layoutKey]);
  const rescueCount = fleet.filter(branch => seaBranchScene(branch, now) === 'rescue').length;
  const sailingBerths = berths.filter(position => seaBranchScene(mission.branches.find(branch => branch.name === position.name)!, now) !== 'rescue');
  const farthest = Math.min(...sailingBerths.map(position => position.y));
  const nearest = Math.max(...sailingBerths.map(position => position.y));
  const berth = (name: string): CSSProperties => {
    const position = berths.find(berth => berth.name === name)!;
    const spaced = layout.find(item => item.name === name);
    return {
      '--berth-x': `${position.x}%`,
      '--berth-width': `${position.width}%`,
      '--berth-depth': Math.max(0, Math.min(1, (position.y - farthest) / Math.max(1, nearest - farthest))),
      '--berth-y': `${position.y}%`,
      '--berth-z': Math.round(position.y * 10),
      ...(spaced ? { '--fleet-x': `${spaced.x}px`, '--fleet-y': `${spaced.y}px`, '--fleet-fit': spaced.fit } : {}),
    } as CSSProperties;
  };

  return <main className="sea-mission" id="sea-mission-content">
    <h1 className="sr-only">مهمة البحر</h1>
    <section ref={mapRef} className="sea-map" data-distance={distance} data-light={light} data-rescuing={rescueCount > 0} data-weather={weather ? atmosphere : 'unavailable'} aria-label={capsizedScene ? "مشهد القوارب المقلوبة" : "رحلة الفروع إلى الجزيرة"} style={{ '--journey-progress': mission.journeyProgress, '--rescue-rows': Math.ceil(rescueCount / 2), '--rescue-vessel-max-width': rescueCount === 1 ? '23rem' : '18rem' } as CSSProperties}>
      <picture className="sea-backdrop" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={backdrop.mobile} />
        <img src={backdrop.desktop} alt="" width="1536" height="1024" fetchPriority="high" />
      </picture>
      {distance === 'distant' && light !== 'night' && <picture className="sea-distant-water" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={SEA_BACKDROPS[light].mobile} />
        <img src={SEA_BACKDROPS[light].desktop} alt="" width="1536" height="1024" />
      </picture>}
      {distance === 'near' && <div className="sea-island" aria-hidden="true"><img src={island} alt="" width="2172" height="724" /></div>}
      <div className="sea-atmosphere" aria-hidden="true" />
      <div className="sea-rain" aria-hidden="true" />
      {capsized.length > 0 && <button type="button" className="sea-scene-switch" onClick={() => { setApprovalBranch(''); lastTap.current = null; setShowCapsized(!capsizedScene); }}>
        {capsizedScene ? 'العودة إلى الرحلة' : 'مشهد القوارب المقلوبة'}
      </button>}
      {message && <p className="sea-approval-message" role="status">{message}</p>}
      <ul className="sea-fleet" role="list">
        {fleet.map(item => {
          const scene = seaBranchScene(item, now);
          const day = item.status !== 'sunk' && seaBranchClock(item.name, now).isOpen ? item.current : undefined;
          const completed = Boolean(day && day.count >= day.target);
          return <li key={item.name} data-branch={item.name} data-order={berths.find(position => position.name === item.name)!.y} style={berth(item.name)}>
          <button type="button" className="sea-vessel" data-scene={scene} aria-pressed={item.name === selected} aria-label={`${item.name}، ${SEA_SCENE_LABELS[scene]}، ${statusLabels[item.status]}${item.current ? `، ${number(item.current.count)} من ${number(item.current.target)}` : ''}`} onClick={event => {
            const time = performance.now();
            const previous = lastTap.current;
            const reveal = onApprove && day && (event.detail === 0 ||
              (previous?.branch === item.name && time - previous.time <= 350));
            lastTap.current = reveal || event.detail === 0 ? null : { branch: item.name, time };
            setApprovalBranch(reveal ? item.name : '');
            setSelected(current => reveal || current !== item.name ? item.name : '');
          }}>
            <span className="sea-vessel-art">
              <span className="sea-water-shadow" aria-hidden="true" />
              <img className="sea-water-contact" src={waterContact} alt="" width="768" height="256" />
              {(scene === 'adventure' || scene === 'halfway' || scene === 'celebrate') && <img className="sea-vessel-wake" src={boatWake} alt="" width="640" height="640" />}
              <img className="sea-vessel-boat" src={seaSceneAsset(item, scene, now)} alt={SEA_SCENE_LABELS[scene]} width="640" height="896" />
              <img className="sea-water-front" src={waterContact} alt="" width="768" height="256" />
            </span>
            {(scene === 'celebrate' || selected === item.name) && <span className="sea-branch-name">{item.name}</span>}
          </button>
          {onApprove && day && approvalBranch === item.name && <button type="button" className="sea-completion" aria-pressed={completed}
            aria-label={`اعتماد إنجاز اليوم — ${item.name}`}
            disabled={Boolean(busyBranch) || completed} onClick={async () => {
              const clickedAt = Date.now();
              if (busyBranch || clickedAt < day.start || clickedAt >= day.end || !seaBranchClock(item.name, clickedAt).isOpen) return;
              setBusyBranch(item.name);
              setMessage('');
              try {
                await onApprove(item.name, day.day);
                setMessage(`تم اعتماد إنجاز اليوم — ${item.name}`);
              } catch {
                setMessage('تعذر حفظ الإنجاز. أعيدي المحاولة.');
              } finally {
                setBusyBranch('');
              }
            }}><span aria-hidden="true">{completed ? '✓' : busyBranch === item.name ? '…' : ''}</span></button>}
        </li>; })}
      </ul>
    </section>
  </main>;
}

export function SeaMission() {
  const { reviewSummaries, summaryReady, currentAccount, syncError } = useData();
  const approvals = useSeaCompletions(currentAccount?.id);
  const [now, setNow] = useState(Date.now);
  const { points } = useRiyadhWeather();
  useEffect(() => {
    // Refresh at an opening boundary even when the page stays open overnight.
    const next = Math.min(...SEA_BRANCHES.flatMap(branch => Array.from({ length: 27 }, (_, index) => seaOpening(branch, index + 5))).filter(boundary => boundary > now));
    const refresh = () => setNow(Date.now());
    const current = Date.now();
    const timer = window.setTimeout(refresh, Math.min(60000 - current % 60000, Math.max(0, next - current)) + 25);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [now]);
  useEffect(() => {
    const title = document.title;
    document.title = 'مهمة البحر | أي آم سبيشل';
    return () => { document.title = title; };
  }, []);
  if (syncError) return <main className="sea-mission"><p role="alert" className="sea-error">تعذر تحديث مهمة البحر. أعيدي المحاولة عند عودة الاتصال.</p></main>;
  if (approvals.error) return <main className="sea-mission"><p role="alert" className="sea-error">{approvals.error}</p></main>;
  const currentTime = Math.max(now, Date.now());
  return <SeaMissionView reviews={reviewSummaries} now={currentTime} weather={weatherAt(points, currentTime)} completions={approvals.completions} ready={summaryReady && (!currentAccount || approvals.ready)} onApprove={approvals.ready && currentAccount?.role === 'admin' ? approvals.approve : undefined} preferredBranch={currentAccount?.branch} />;
}
