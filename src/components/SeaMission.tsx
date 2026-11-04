import { useEffect, useState, type CSSProperties } from 'react';
import { Building2, Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import { seaBerths, seaBranchName, seaMission, seaOpening, SEA_BRANCHES, type SeaBranch } from '../lib/seaMission';
import { seaBranchClock, seaBranchScene, seaLight, SEA_SCENE_LABELS } from '../lib/seaScene';
import { SEA_BACKDROPS, SEA_SCENE_ASSETS } from './seaSceneAssets';
import island from '../assets/sea/island-realistic.webp';
import boatWake from '../assets/sea/boat-wake.webp';
import './SeaMission.css';

const number = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const shortDate = (timestamp: number) => new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', calendar: 'gregory', day: 'numeric', month: 'long' }).format(timestamp);
const statusLabels: Record<SeaBranch['status'], string> = { waiting: 'لم تبدأ', sailing: 'مستمر', sunk: 'غرق', arrived: 'وصل', unverified: 'قيد التحقق' };
type SeaReview = Parameters<typeof seaMission>[0][number];
const openingTime = (timestamp: number) => new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(timestamp);

export function SeaMissionView({ reviews, now, preferredBranch = '' }: { reviews: readonly SeaReview[]; now: number; preferredBranch?: string }) {
  const mission = seaMission(reviews, now);
  const [selected, setSelected] = useState(() => seaBranchName(preferredBranch) || SEA_BRANCHES[0]);
  const branch = mission.branches.find(branch => branch.name === selected) || mission.branches[0];
  const light = seaLight(now);
  const berths = seaBerths(mission.branches, now);
  const berth = (name: string): CSSProperties => {
    const position = berths.find(berth => berth.name === name)!;
    return {
      '--berth-x': `${position.x}%`,
      '--berth-width': `${position.width}%`,
      '--berth-row': position.row,
    } as CSSProperties;
  };

  return <main className="sea-mission" id="sea-mission-content">
    <h1 className="sr-only">مهمة البحر</h1>
    <section className="sea-map" data-light={light} aria-label="رحلة الفروع إلى الجزيرة" style={{ '--journey-progress': mission.journeyProgress } as CSSProperties}>
      <picture className="sea-backdrop" aria-hidden="true">
        <source media="(max-width:760px)" srcSet={SEA_BACKDROPS[light].mobile} />
        <img src={SEA_BACKDROPS[light].desktop} alt="" width="1536" height="1024" fetchPriority="high" />
      </picture>
      <div className="sea-island" aria-hidden="true"><img src={island} alt="" width="1024" height="683" /></div>
      <p className="sea-timeline">{!mission.started ? 'الانطلاق ٥ نوفمبر' : mission.finished ? 'نهاية الرحلة' : shortDate(now)}</p>
      <ul className="sea-fleet" role="list">
        {mission.branches.map(item => {
          const scene = seaBranchScene(item, now);
          const clock = seaBranchClock(item.name, now);
          return <li key={item.name} style={berth(item.name)}>
          <button type="button" className="sea-vessel" data-scene={scene} aria-pressed={item.name === branch.name} onClick={() => setSelected(item.name)}>
            <span className="sea-vessel-art">
              {(scene === 'adventure' || scene === 'celebrate') && <img className="sea-vessel-wake" src={boatWake} alt="" width="640" height="640" />}
              <img className="sea-vessel-boat" src={SEA_SCENE_ASSETS[item.name][scene]} alt={SEA_SCENE_LABELS[scene]} width="640" height="896" />
            </span>
            <span className="sea-branch-label"><span><Building2 size={14} aria-hidden="true" />{item.name}</span>
              <span className={`sea-count ${item.current && item.current.count >= item.current.target ? 'sea-count-complete' : ''}`}>
                {item.status === 'sunk' ? <>غرق {shortDate(item.failedDay!.start)}</> : item.status === 'waiting' || item.status === 'unverified' ? statusLabels[item.status] : item.status === 'arrived' ? <><Check size={13} aria-hidden="true" />وصل</> : item.current ? <>{number(item.current.count)} من {number(item.current.target)}</> : null}
              </span>
              {scene === 'sleep' && <span className="sea-sleep-until">الفتح {openingTime(item.status === 'waiting' ? item.days[0].start : clock.nextOpening)}</span>}
            </span>
          </button>
        </li>; })}
      </ul>
      <span className="sea-start" aria-hidden="true">البداية · ٥ نوفمبر</span>
    </section>

  </main>;
}

export function SeaMission() {
  const { reviewSummaries, currentAccount, syncError } = useData();
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
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
  if (syncError || !online) return <main className="sea-mission"><p role="alert" className="sea-error">تعذر تحديث مهمة البحر. أعيدي المحاولة عند عودة الاتصال.</p></main>;
  return <SeaMissionView reviews={reviewSummaries} now={Math.max(now, Date.now())} preferredBranch={currentAccount?.branch} />;
}
