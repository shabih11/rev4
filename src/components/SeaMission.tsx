import { useEffect, useState, type CSSProperties } from 'react';
import { useData } from '../context/DataContext';
import { useRiyadhWeather } from '../hooks/useRiyadhWeather';
import { seaWeather, weatherAt, type RiyadhWeather } from '../lib/riyadhWeather';
import { seaForegroundBerths, seaMission, seaOpening, SEA_BRANCHES, type SeaBranch } from '../lib/seaMission';
import { seaBranchScene, seaLight, SEA_SCENE_LABELS } from '../lib/seaScene';
import { SEA_BACKDROPS, SEA_SCENE_ASSETS } from './seaSceneAssets';
import island from '../assets/sea/island-horizon.webp';
import boatWake from '../assets/sea/boat-wake.webp';
import waterContact from '../assets/sea/boat-water-contact.webp';
import './SeaMission.css';

const number = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const statusLabels: Record<SeaBranch['status'], string> = { waiting: 'لم تبدأ', sailing: 'مستمر', sunk: 'غرق', arrived: 'وصل', unverified: 'قيد التحقق' };
type SeaReview = Parameters<typeof seaMission>[0][number];

export function SeaMissionView({ reviews, now, weather = null }: { reviews: readonly SeaReview[]; now: number; preferredBranch?: string; weather?: RiyadhWeather | null }) {
  const mission = seaMission(reviews, now);
  const [selected, setSelected] = useState('');
  const light = seaLight(now, weather);
  const atmosphere = seaWeather(weather);
  const berths = seaForegroundBerths(mission.branches, now);
  const berth = (name: string): CSSProperties => {
    const position = berths.find(berth => berth.name === name)!;
    return {
      '--berth-x': `${position.x}%`,
      '--berth-width': `${position.width}%`,
      '--berth-depth': Math.max(0, Math.min(1, (position.y - 65) / 32)),
      '--berth-y': `${position.y}%`,
      '--berth-z': Math.round(position.y * 10),
    } as CSSProperties;
  };

  return <main className="sea-mission" id="sea-mission-content">
    <h1 className="sr-only">مهمة البحر</h1>
    <section className="sea-map" data-light={light} data-weather={weather ? atmosphere : 'unavailable'} aria-label="رحلة الفروع إلى الجزيرة" style={{ '--journey-progress': mission.journeyProgress } as CSSProperties}>
      <picture className="sea-backdrop" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={SEA_BACKDROPS[light].mobile} />
        <img src={SEA_BACKDROPS[light].desktop} alt="" width="1536" height="1024" fetchPriority="high" />
      </picture>
      <div className="sea-island" aria-hidden="true"><img src={island} alt="" width="1536" height="174" /></div>
      <div className="sea-atmosphere" aria-hidden="true" />
      <div className="sea-rain" aria-hidden="true" />
      <ul className="sea-fleet" role="list">
        {mission.branches.map(item => {
          const scene = seaBranchScene(item, now);
          return <li key={item.name} style={berth(item.name)}>
          <button type="button" className="sea-vessel" data-scene={scene} aria-pressed={item.name === selected} aria-label={`${item.name}، ${SEA_SCENE_LABELS[scene]}، ${statusLabels[item.status]}${item.current ? `، ${number(item.current.count)} من ${number(item.current.target)}` : ''}`} onClick={() => setSelected(current => current === item.name ? '' : item.name)}>
            <span className="sea-vessel-art">
              <span className="sea-water-shadow" aria-hidden="true" />
              <img className="sea-water-contact" src={waterContact} alt="" width="768" height="256" />
              {(scene === 'adventure' || scene === 'celebrate') && <img className="sea-vessel-wake" src={boatWake} alt="" width="640" height="640" />}
              <img className="sea-vessel-boat" src={SEA_SCENE_ASSETS[item.name][scene]} alt={SEA_SCENE_LABELS[scene]} width="640" height="896" />
              <img className="sea-water-front" src={waterContact} alt="" width="768" height="256" />
            </span>
            {selected === item.name && <span className="sea-branch-name">{item.name}</span>}
          </button>
        </li>; })}
      </ul>
    </section>

  </main>;
}

export function SeaMission() {
  const { reviewSummaries, currentAccount, syncError } = useData();
  const [now, setNow] = useState(Date.now);
  const { points } = useRiyadhWeather();
  useEffect(() => {
    // Refresh at an opening boundary even when the page stays open overnight.
    const next = Math.min(...SEA_BRANCHES.flatMap(branch => Array.from({ length: 27 }, (_, index) => seaOpening(branch, index + 5))).filter(boundary => boundary > now));
    const refresh = () => setNow(Date.now());
    const timer = window.setTimeout(refresh, Math.min(60000, Math.max(0, next - Date.now()) + 25));
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
  const currentTime = Math.max(now, Date.now());
  return <SeaMissionView reviews={reviewSummaries} now={currentTime} weather={weatherAt(points, currentTime)} preferredBranch={currentAccount?.branch} />;
}
