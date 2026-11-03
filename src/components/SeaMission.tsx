import { useEffect, useState, type CSSProperties } from 'react';
import { Building2, CalendarDays, Check, Clock3, Coins, Sailboat, Star, Vault, Waves } from 'lucide-react';
import { useData } from '../context/DataContext';
import { seaBranchName, seaMission, seaOpening, SEA_BRANCHES, SEA_MISSION, type SeaBranch } from '../lib/seaMission';
import { formatTime } from '../lib/formatDate';
import island from '../assets/sea/island.webp';
import boat from '../assets/sea/boat.webp';
import './SeaMission.css';

const number = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });
const shortDate = (timestamp: number) => new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', calendar: 'gregory', day: 'numeric', month: 'long' }).format(timestamp);
const time = (timestamp: number) => formatTime(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp));
const statusLabels: Record<SeaBranch['status'], string> = { waiting: 'لم تبدأ', sailing: 'مستمر', sunk: 'غرق', arrived: 'وصل', unverified: 'قيد التحقق' };
type SeaReview = Parameters<typeof seaMission>[0][number];

export function SeaMissionView({ reviews, now, preferredBranch = '' }: { reviews: readonly SeaReview[]; now: number; preferredBranch?: string }) {
  const mission = seaMission(reviews, now);
  const [selected, setSelected] = useState(() => seaBranchName(preferredBranch) || SEA_BRANCHES[0]);
  const branch = mission.branches.find(branch => branch.name === selected) || mission.branches[0];
  const afloat = mission.branches.filter(branch => branch.status !== 'sunk');
  const sunk = mission.branches.filter(branch => branch.status === 'sunk');
  const day = branch.failedDay || branch.current;
  const count = day?.count ?? 0;
  const columns = afloat.length > 4 ? 3 : Math.max(1, afloat.length);
  const currentProgress = Math.max(...afloat.map(branch => branch.progress), 0);

  return <main className="sea-mission" id="sea-mission-content">
    <div className="sea-heading">
      <h1><Waves aria-hidden="true" />مهمة البحر<Waves aria-hidden="true" /></h1>
      <p className="sea-dates"><CalendarDays size={16} aria-hidden="true" />٥–٣٠ نوفمبر ٢٠٢٦</p>
    </div>

    <dl className="sea-metrics">
      <div><Vault aria-hidden="true" /><dt>الغنيمة</dt><dd>{number(SEA_MISSION.reward)} <span>ريال</span></dd></div>
      <div><Sailboat aria-hidden="true" /><dt>{mission.finished ? 'فروع وصلت' : 'فروع مستمرة'}</dt><dd>{number(mission.remaining)}</dd></div>
      <div><Coins aria-hidden="true" /><dt>{mission.finished && !mission.uncertain ? 'حصة الفرع' : 'حصة الفرع المتوقعة'}</dt><dd>{mission.share === null ? '—' : <>{number(mission.share)} <span>ريال</span></>}</dd></div>
    </dl>

    <section className="sea-map" aria-label="رحلة الفروع إلى الجزيرة" style={{ '--fleet-columns': columns, '--fleet-progress': currentProgress, '--fleet-rows': Math.ceil(afloat.length / columns), '--wrecks': sunk.length } as CSSProperties}>
      <div className="sea-island" aria-hidden="true"><span>٣٠ نوفمبر</span><img src={island} alt="" width="850" height="567" /></div>
      <div className="sea-timeline" aria-hidden="true"><span>٥ نوفمبر</span><span>{!mission.started ? 'تنطلق قريبًا' : mission.finished ? 'نهاية الرحلة' : shortDate(now)}</span><span>٣٠ نوفمبر</span></div>
      <ul className="sea-fleet" role="list">
        {afloat.map((item, index) => <li key={item.name} style={{ '--progress': item.progress, '--lane': index } as CSSProperties}>
          <button type="button" className="sea-vessel" aria-pressed={item.name === branch.name} onClick={() => setSelected(item.name)}>
            <img src={boat} alt="" width="240" height="240" />
            <span className="sea-branch-label"><span><Building2 size={14} aria-hidden="true" />{item.name}</span>
              <span className={`sea-count ${item.current && item.current.count >= 2 ? 'sea-count-complete' : ''}`}>
                {item.status === 'waiting' || item.status === 'unverified' ? statusLabels[item.status] : item.status === 'arrived' ? <><Check size={13} aria-hidden="true" />وصل</> : <>{number(item.current?.count ?? 0)} من ٢</>}
              </span>
            </span>
          </button>
        </li>)}
      </ul>
      {afloat.length === 0 && <p className="sea-empty">لم يصل أي فرع</p>}
      {sunk.length > 0 && <ul className="sea-wrecks" role="list">
        {sunk.map(item => <li key={item.name} style={{ '--progress': item.progress, '--lane': mission.branches.indexOf(item) } as CSSProperties}>
          <button type="button" onClick={() => setSelected(item.name)} aria-pressed={item.name === branch.name}>
            <img src={boat} alt="" width="240" height="240" />
            <span><Building2 size={14} aria-hidden="true" /><strong>{item.name}</strong><span>غرق {shortDate(item.failedDay!.start)}</span></span>
          </button>
        </li>)}
      </ul>}
      <span className="sea-start" aria-hidden="true">البداية · ٥ نوفمبر</span>
    </section>

    <section className="sea-selected" aria-labelledby="sea-selected-name">
      <div className="sea-selected-heading"><Building2 aria-hidden="true" /><h2 id="sea-selected-name">فرع {branch.name}</h2><span className={`sea-status sea-status-${branch.status}`}>{branch.status === 'sailing' || branch.status === 'arrived' ? <Check size={15} aria-hidden="true" /> : null}{statusLabels[branch.status]}</span></div>
      {branch.status === 'waiting' ? <p className="sea-selected-message">تبدأ ٥ نوفمبر، {time(branch.days[0].start)}</p>
        : branch.status === 'unverified' ? <p className="sea-selected-message">يلزم التحقق من أوقات التقييمات.</p>
        : branch.status === 'arrived' ? <p className="sea-selected-message">اكتملت الرحلة</p>
        : <>
          <div className="sea-daily"><div><strong>{branch.status === 'sunk' ? shortDate(day!.start) : 'تقييمات اليوم'} · {number(count)} من ٢</strong><p>{branch.status === 'sunk' ? 'لم يكتمل الهدف' : count >= 2 ? 'اكتمل هدف اليوم' : count === 1 ? 'باقي تقييم واحد' : 'باقي تقييمان'}</p></div><div className="sea-stars" aria-hidden="true"><Star fill={count >= 1 ? 'currentColor' : 'none'} /><Star fill={count >= 2 ? 'currentColor' : 'none'} /></div></div>
          {branch.status === 'sailing' && day && <p className="sea-deadline"><Clock3 size={14} aria-hidden="true" />حتى الافتتاح القادم · {time(day.end)}</p>}
        </>}
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
  return <SeaMissionView reviews={reviewSummaries} now={now} preferredBranch={currentAccount?.branch} />;
}
