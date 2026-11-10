import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { seaFleetLayout, type SeaFleetPosition } from '../lib/seaFleetLayout';
import { useData } from '../context/DataContext';
import { useRiyadhWeather } from '../hooks/useRiyadhWeather';
import { seaWeather, weatherAt, type RiyadhWeather } from '../lib/riyadhWeather';
import { seaMission, seaOpening, SEA_BRANCHES, type SeaBranch, type SeaCompletion } from '../lib/seaMission';
import { seaBranchScene, seaSceneBerths, seaLight, seaSunGlare, seaViewDistance, SEA_SCENE_LABELS } from '../lib/seaScene';
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

export function SeaMissionView({ reviews, now, weather = null, completions = [], onApprove }: {
  reviews: readonly SeaReview[]; now: number; preferredBranch?: string; weather?: RiyadhWeather | null;
  completions?: readonly SeaCompletion[]; onApprove?: (branch: string, day: number) => Promise<void>;
}) {
  const mission = seaMission(reviews, now, completions);
  const [selected, setSelected] = useState('');
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedBranch = mission.branches.find(branch => branch.name === selected);
  const availableDays = selectedBranch?.days.filter(day => day.start <= now) ?? [];
  const defaultDay = selectedBranch?.failedDay ?? selectedBranch?.days.find(day => day.end <= now && day.uncertain && day.count < day.target) ?? selectedBranch?.current ?? availableDays.at(-1);
  const approvalDay = availableDays.find(day => day.day === chosenDay) ?? defaultDay;
  const light = seaLight(now);
  const distance = seaViewDistance(now);
  const glare = distance === 'distant' && seaSunGlare(now);
  const distantBackdrop = light === 'night'
    ? { mobile: distantNightMobile, desktop: distantNightDesktop }
    : glare ? { mobile: glareMobile, desktop: glareDesktop }
      : { mobile: distantMobile, desktop: distantDesktop };
  const backdrop = distance === 'distant' ? distantBackdrop : SEA_BACKDROPS[light];
  const atmosphere = seaWeather(weather);
  const berths = seaSceneBerths(mission.branches, now);
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
      setLayout(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(map);
    map.addEventListener('load', arrange, true);
    return () => { observer.disconnect(); map.removeEventListener('load', arrange, true); };
  }, [layoutKey]);
  const rescueCount = mission.branches.filter(branch => seaBranchScene(branch, now) === 'rescue').length;
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
    <section ref={mapRef} className="sea-map" data-distance={distance} data-light={light} data-rescuing={rescueCount > 0} data-weather={weather ? atmosphere : 'unavailable'} aria-label="رحلة الفروع إلى الجزيرة" style={{ '--journey-progress': mission.journeyProgress, '--rescue-rows': Math.ceil(rescueCount / 2), '--rescue-vessel-max-width': rescueCount === 1 ? '23rem' : '18rem' } as CSSProperties}>
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
      <ul className="sea-fleet" role="list">
        {mission.branches.map(item => {
          const scene = seaBranchScene(item, now);
          return <li key={item.name} data-branch={item.name} data-order={berths.find(position => position.name === item.name)!.y} style={berth(item.name)}>
          <button type="button" className="sea-vessel" data-scene={scene} aria-pressed={item.name === selected} aria-label={`${item.name}، ${SEA_SCENE_LABELS[scene]}، ${statusLabels[item.status]}${item.current ? `، ${number(item.current.count)} من ${number(item.current.target)}` : ''}`} onClick={() => { setSelected(current => current === item.name ? '' : item.name); setChosenDay(null); setMessage(''); }}>
            <span className="sea-vessel-art">
              <span className="sea-water-shadow" aria-hidden="true" />
              <img className="sea-water-contact" src={waterContact} alt="" width="768" height="256" />
              {(scene === 'adventure' || scene === 'halfway' || scene === 'celebrate') && <img className="sea-vessel-wake" src={boatWake} alt="" width="640" height="640" />}
              <img className="sea-vessel-boat" src={seaSceneAsset(item, scene, now)} alt={SEA_SCENE_LABELS[scene]} width="640" height="896" />
              <img className="sea-water-front" src={waterContact} alt="" width="768" height="256" />
            </span>
            {(scene === 'celebrate' || selected === item.name) && <span className="sea-branch-name">{item.name}</span>}
          </button>
        </li>; })}
      </ul>
    </section>
    {onApprove && selectedBranch && <aside className="sea-admin-panel" aria-label="اعتماد إنجاز القارب" dir="rtl">
      <strong>{selectedBranch.name}</strong>
      {approvalDay ? <>
        <label>يوم المهمة <select aria-label="يوم المهمة" value={approvalDay.day} disabled={busy} onChange={event => { setChosenDay(Number(event.target.value)); setMessage(''); }}>
          {availableDays.map(day => <option key={day.day} value={day.day}>{number(day.day)} نوفمبر{day.manuallyCompleted ? ' — معتمد يدويًا' : day.count >= day.target ? ' — منجز' : ''}</option>)}
        </select></label>
        <p>اعتماد إنجاز هذا اليوم عند تأخر تقييمات قوقل، دون تغيير التقييمات أو نقاط الموظفات.</p>
        <button type="button" disabled={busy || approvalDay.count >= approvalDay.target} onClick={async () => {
          if (busy) return;
          setBusy(true); setMessage('');
          try { await onApprove(selectedBranch.name, approvalDay.day); setMessage('تم اعتماد إنجاز اليوم وحفظه للجميع.'); }
          catch { setMessage('تعذر حفظ الإنجاز. تحققي من الاتصال والصلاحيات ثم أعيدي المحاولة.'); }
          finally { setBusy(false); }
        }}>{busy ? 'جارٍ الحفظ…' : approvalDay.count >= approvalDay.target ? 'اليوم منجز' : 'تحويل إلى مشهد الإنجاز'}</button>
      </> : <p>لم تبدأ مهمة هذا الفرع بعد.</p>}
      {message && <p role="status">{message}</p>}
    </aside>}
  </main>;
}

export function SeaMission() {
  const { reviewSummaries, currentAccount, syncError, seaApprovals: approvals } = useData();
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
  if (!approvals.ready) return <main className="sea-mission"><p role="status" className="sea-error">جارٍ تحميل مهمة البحر…</p></main>;
  const currentTime = Math.max(now, Date.now());
  return <SeaMissionView reviews={reviewSummaries} now={currentTime} weather={weatherAt(points, currentTime)} completions={approvals.completions} onApprove={currentAccount?.role === 'admin' ? approvals.approve : undefined} preferredBranch={currentAccount?.branch} />;
}
