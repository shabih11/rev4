import { AvatarEffectIcon } from './AvatarEffectBadge';
import type { AvatarSeaReturn } from '../lib/avatarPrivileges';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { seaFleetLayout, type SeaFleetPosition } from '../lib/seaFleetLayout';
import { useData } from '../context/DataContext';
import { useSeaCompletions } from '../hooks/useSeaCompletions';
import { useRiyadhWeather } from '../hooks/useRiyadhWeather';
import { seaWeather, weatherAt, type RiyadhWeather } from '../lib/riyadhWeather';
import { seaMission, seaOpening, SEA_BRANCHES, type SeaBranch, type SeaCompletion } from '../lib/seaMission';
import { seaBranchClock, seaBranchScene, seaSceneBerths, seaLight, seaSunGlare, seaViewDistance, seaIslandApproachDay, SEA_SCENE_LABELS } from '../lib/seaScene';
import { SEA_BACKDROPS, seaSceneAsset } from './seaSceneAssets';
import { ISLAND_APPROACH_ASSETS, ISLAND_APPROACH_FRAME_ASPECT, SEA_SHORE_BREAK } from './seaIslandApproachAssets';
import island from '../assets/sea/island-terrain-shore.webp';
import distantMobile from '../assets/sea/ocean-distant-mobile.webp';
import distantDesktop from '../assets/sea/ocean-distant-desktop.webp';
import distantNightMobile from '../assets/sea/ocean-distant-night-mobile.webp';
import distantNightDesktop from '../assets/sea/ocean-distant-night-desktop.webp';
import glareMobile from '../assets/sea/ocean-distant-glare-mobile.webp';
import glareDesktop from '../assets/sea/ocean-distant-glare-desktop.webp';
import rainBackdrop from '../assets/sea/weather-rain.webp';
import cloudsBackdrop from '../assets/sea/weather-clouds.webp';
import stormBackdrop from '../assets/sea/weather-storm.webp';
import waterContact from '../assets/sea/boat-water-contact.webp';
import './SeaMission.css';

const number = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const statusLabels: Record<SeaBranch['status'], string> = { waiting: 'لم تبدأ', sailing: 'مستمر', sunk: 'غرق', arrived: 'وصل', unverified: 'قيد التحقق' };
type SeaReview = Parameters<typeof seaMission>[0][number];

export function SeaMissionView({ reviews, now, weather = null, completions = [], returns = [], ready = true, onApprove }: {
  reviews: readonly SeaReview[]; now: number; preferredBranch?: string; weather?: RiyadhWeather | null;
  returns?: readonly AvatarSeaReturn[];
  completions?: readonly SeaCompletion[]; ready?: boolean; onApprove?: (branch: string, day: number) => Promise<void>;
}) {
  const mission = seaMission(reviews, now, completions, returns);
  const [selected, setSelected] = useState('');
  const [approvalBranch, setApprovalBranch] = useState('');
  const lastTap = useRef<{ branch: string; time: number } | null>(null);
  const [busyBranch, setBusyBranch] = useState('');
  const [message, setMessage] = useState('');
  const branches = ready ? mission.branches : [];
  const fleet = branches;
  const light = seaLight(now);
  const distance = seaViewDistance(now);
  const approachDay = seaIslandApproachDay(now);
  const approachAsset = approachDay ? ISLAND_APPROACH_ASSETS[approachDay - 1] : null;
  const useDistantBackdrop = distance === 'distant' || Boolean(approachDay);
  const glare = useDistantBackdrop && seaSunGlare(now);
  const distantBackdrop = light === 'night'
    ? { mobile: distantNightMobile, desktop: distantNightDesktop }
    : glare ? { mobile: glareMobile, desktop: glareDesktop }
      : { mobile: distantMobile, desktop: distantDesktop };
  const atmosphere = seaWeather(weather);
  const weatherBackdrop = weather && atmosphere !== 'clear'
    ? atmosphere === 'storm' ? stormBackdrop : atmosphere === 'rain' ? rainBackdrop : cloudsBackdrop
    : null;
  const backdrop = weatherBackdrop ? { mobile: weatherBackdrop, desktop: weatherBackdrop }
    : useDistantBackdrop ? distantBackdrop : SEA_BACKDROPS[light];
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
        return { name: item.dataset.branch!, scene: button.dataset.scene, width: button.offsetWidth * scale, height: button.offsetHeight * scale,
          preferredX: parseFloat(item.style.getPropertyValue('--berth-x')) / 100,
          order: Number(item.dataset.order) };
      });
      const next = seaFleetLayout(vessels, map.clientWidth, map.clientHeight);
      for (const item of map.querySelectorAll<HTMLLIElement>('.sea-fleet > li')) {
        const position = next.find(vessel => vessel.name === item.dataset.branch);
        const button = item.querySelector<HTMLButtonElement>('.sea-vessel')!;
        item.style.setProperty('--vessel-rise', `${button.offsetHeight * 1.3 * (position?.fit ?? 1)}px`);
      }
      // Anchor landing to the waterline of the leading intact boat, not a viewport guess.
      const landingLines = next.flatMap(position => {
        const vessel = vessels.find(item => item.name === position.name);
        return vessel && !['rescue', 'wreck', 'capsized', 'distress'].includes(vessel.scene ?? '')
          ? [position.y - vessel.height * position.fit * .24] : [];
      });
      map.style.setProperty('--coast-arrival-y', `${landingLines.length ? Math.min(...landingLines) / map.clientHeight * 100 : 52}%`);
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
    <section ref={mapRef} className="sea-map" data-approach-day={approachDay ?? undefined} data-weather-art={Boolean(weatherBackdrop)} data-distance={distance} data-light={light} data-rescuing={rescueCount > 0} data-weather={weather ? atmosphere : 'unavailable'} aria-label="رحلة الفروع إلى الجزيرة" style={{ '--journey-progress': mission.journeyProgress, '--approach-advance': Math.min(2, Math.max(0, (approachDay ?? 0) - 5)), '--coast-landing-progress': Math.max(0, ((approachDay ?? 0) - 7) / 3), '--rescue-rows': Math.ceil(rescueCount / 2), '--rescue-vessel-max-width': rescueCount === 1 ? '23rem' : '18rem' } as CSSProperties}>
      <picture className="sea-backdrop" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={backdrop.mobile} />
        <img src={backdrop.desktop} alt="" width="1536" height="1024" fetchPriority="high" />
      </picture>
      {useDistantBackdrop && light !== 'night' && !weatherBackdrop && <picture className="sea-distant-water" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={SEA_BACKDROPS[light].mobile} />
        <img src={SEA_BACKDROPS[light].desktop} alt="" width="1536" height="1024" />
      </picture>}
      {approachDay && <picture className="sea-approach-sky" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={backdrop.mobile} />
        <img src={backdrop.desktop} alt="" width="1536" height="1024" />
      </picture>}
      {approachDay && approachAsset ? <div className={approachDay > 5 ? 'sea-island sea-island-approach sea-island-coast' : 'sea-island sea-island-approach'} aria-hidden="true" style={{ '--approach-day': approachDay, '--approach-scale': 0.5 * Math.pow(1.1, approachDay - 1), '--island-aspect': 9.9, '--island-frame-aspect': approachDay > 5 ? approachAsset.aspect : ISLAND_APPROACH_FRAME_ASPECT, '--source-bottom-shift': `${(approachAsset.height + approachAsset.top - 100) / approachAsset.height * 100}%`, '--source-left': `${approachAsset.left}%`, '--source-top': `${approachAsset.top}%`, '--source-width': `${approachAsset.width}%`, '--source-height': `${approachAsset.height}%` } as CSSProperties}><picture><source media="(max-width:760px)" srcSet={approachAsset.mobile} /><img src={approachAsset.src} alt="" width="2172" height="724" decoding="async" /></picture></div> : distance === 'near' && <div className="sea-island" aria-hidden="true"><img src={island} alt="" width="2172" height="724" /></div>}
      {approachDay && <div className="sea-shore-break" aria-hidden="true" style={{ '--shore-scale': Math.min(1, approachDay / 8), '--shore-source-top': `${SEA_SHORE_BREAK.top}%`, '--shore-source-height': `${SEA_SHORE_BREAK.height}%` } as CSSProperties}>
        <img src={SEA_SHORE_BREAK.src} alt="" width="1170" height="390" decoding="async" />
      </div>}
      <div className="sea-atmosphere" aria-hidden="true" />
      <div className="sea-rain" aria-hidden="true" />

      {message && <p className="sea-approval-message" role="status">{message}</p>}
      <ul className="sea-fleet" role="list">
        {fleet.map(item => {
          const scene = seaBranchScene(item, now);
          const day = item.status !== 'sunk' && seaBranchClock(item.name, now).isOpen ? item.current : undefined;
          const completed = Boolean(day?.manuallyCompleted);
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
              {item.days.some(day => day.avatarRescued && day.phase === item.current?.phase) && <span className="absolute inset-x-0 top-0 z-20 text-center" title="أُنقذت السفينة بعودة أم خماس لهذه المرحلة"><AvatarEffectIcon /></span>}
              <span className="sea-hull-ripples" aria-hidden="true" /><span className="sea-hull-ripples sea-hull-ripples-extra" aria-hidden="true" />
              <span className="sea-water-shadow" aria-hidden="true" />
              <img className="sea-water-contact" src={waterContact} alt="" width="768" height="256" />
              <img className="sea-vessel-boat" src={seaSceneAsset(item, scene, now, atmosphere)} alt={SEA_SCENE_LABELS[scene]} width="640" height="896" />
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
  const { avatarPrivileges, reviewSummaries, summaryReady, currentAccount, syncError } = useData();
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
  return <SeaMissionView reviews={reviewSummaries} now={currentTime} weather={weatherAt(points, currentTime)} returns={avatarPrivileges?.seaReturns} completions={approvals.completions} ready={summaryReady && (!currentAccount || approvals.ready)} onApprove={approvals.ready && currentAccount?.role === 'admin' ? approvals.approve : undefined} preferredBranch={currentAccount?.branch} />;
}
