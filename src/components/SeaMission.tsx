import { useEffect, useState, type CSSProperties } from 'react';
import { Building2, Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import { seaBerths, seaBranchName, seaMission, seaOpening, SEA_BRANCHES, type SeaBranch } from '../lib/seaMission';
import island from '../assets/sea/island.webp';
import boat from '../assets/sea/boat.webp';
import departingBoat from '../assets/sea/boat-stern.webp';
import './SeaMission.css';

const number = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const shortDate = (timestamp: number) => new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', calendar: 'gregory', day: 'numeric', month: 'long' }).format(timestamp);
const statusLabels: Record<SeaBranch['status'], string> = { waiting: 'لم تبدأ', sailing: 'مستمر', sunk: 'غرق', arrived: 'وصل', unverified: 'قيد التحقق' };
type SeaReview = Parameters<typeof seaMission>[0][number];

export function SeaMissionView({ reviews, now, preferredBranch = '' }: { reviews: readonly SeaReview[]; now: number; preferredBranch?: string }) {
  const mission = seaMission(reviews, now);
  const [selected, setSelected] = useState(() => seaBranchName(preferredBranch) || SEA_BRANCHES[0]);
  const branch = mission.branches.find(branch => branch.name === selected) || mission.branches[0];
  const afloat = mission.branches.filter(branch => branch.status !== 'sunk');
  const sunk = mission.branches.filter(branch => branch.status === 'sunk');
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
    <section className="sea-map" aria-label="رحلة الفروع إلى الجزيرة" style={{ '--journey-progress': mission.journeyProgress } as CSSProperties}>
      <div className="sea-island" aria-hidden="true"><img src={island} alt="" width="850" height="567" /></div>
      <p className="sea-timeline">{!mission.started ? 'تنطلق قريبًا' : mission.finished ? 'نهاية الرحلة' : shortDate(now)}</p>
      <ul className="sea-fleet" role="list">
        {afloat.map(item => <li key={item.name} style={berth(item.name)}>
          <button type="button" className="sea-vessel" aria-pressed={item.name === branch.name} onClick={() => setSelected(item.name)}>
            <img src={departingBoat} alt="" width="240" height="320" />
            <span className="sea-branch-label"><span><Building2 size={14} aria-hidden="true" />{item.name}</span>
              <span className={`sea-count ${item.current && item.current.count >= item.current.target ? 'sea-count-complete' : ''}`}>
                {item.status === 'waiting' || item.status === 'unverified' ? statusLabels[item.status] : item.status === 'arrived' ? <><Check size={13} aria-hidden="true" />وصل</> : item.current ? <>{number(item.current.count)} من {number(item.current.target)}</> : null}
              </span>
            </span>
          </button>
        </li>)}
      </ul>
      {afloat.length === 0 && <p className="sea-empty">لم يصل أي فرع</p>}
      {sunk.length > 0 && <ul className="sea-wrecks" role="list">
        {sunk.map(item => <li key={item.name} style={berth(item.name)}>
          <button type="button" onClick={() => setSelected(item.name)} aria-pressed={item.name === branch.name}>
            <img src={boat} alt="" width="240" height="240" />
            <span><Building2 size={14} aria-hidden="true" /><strong>{item.name}</strong><span>غرق {shortDate(item.failedDay!.start)}</span></span>
          </button>
        </li>)}
      </ul>}
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
