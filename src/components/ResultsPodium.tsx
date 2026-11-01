import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Minus, Plus, RotateCcw, Trophy } from 'lucide-react';
import type { UserAccount } from '../lib/mockData';
import type { EmployeeReward } from '../lib/employeeRewards';
import './ResultsPodium.css';

interface Props {
  employees: UserAccount[];
  rewards: Record<string, EmployeeReward> | null;
  period: Date;
  rounding: boolean;
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

export function ResultsPodium({ employees, rewards, period, rounding, renderAvatar, renderEmployee }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [zoom, setZoom] = useState(1);
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
  const fit = Math.min(1, Math.max(0.1, (width - 24) / 1220));
  const scale = fit * zoom;
  const periodLabel = period.toLocaleDateString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', month: 'long', year: 'numeric' });
  const money = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 2 });

  return <main className="results-podium" aria-label="منصة الأوائل السبع" dir="rtl">
    <div className="results-spotlights" aria-hidden="true"><i /><i /><i /><i /></div>
    {celebrating && <div className="results-confetti" aria-hidden="true">{confetti.map((piece, index) => <i key={index} style={{ '--piece-x': `${piece.x}%`, '--piece-drift': `${piece.drift}px`, '--piece-rise': `${-piece.rise}px`, '--piece-turn': `${piece.turn}deg`, '--piece-color': piece.color } as CSSProperties} />)}</div>}
    <header className="results-podium-heading">
      <span className="results-podium-eyebrow"><Trophy size={17} aria-hidden="true" /> حصاد التميّز</span>
      <h1>منصة الأوائل</h1>
      <p>{periodLabel}<span aria-hidden="true"> · </span>سبع موظفات، إنجاز يستحق الاحتفاء</p>
    </header>
    <div className="results-podium-toolbar" role="group" aria-label="حجم منصة الأوائل">
      <button type="button" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))} aria-label="تصغير المنصة"><Minus size={18} /></button>
      <output aria-live="polite">{Math.round(zoom * 100).toLocaleString('ar-SA')}٪</output>
      <button type="button" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))} aria-label="تكبير المنصة"><Plus size={18} /></button>
      <button type="button" onClick={() => { setZoom(1); viewport.current?.scrollTo({ left: 0 }); }} aria-label="إظهار المنصات السبع بالكامل"><RotateCcw size={16} /><span>عرض الكل</span></button>
    </div>
    <p id="results-podium-help" className="results-podium-help">المنصات السبع ظاهرة بالكامل. كبّري العرض ومرّري يمينًا ويسارًا لقراءة التفاصيل.</p>
    <div ref={viewport} className="results-podium-viewport" tabIndex={0} role="region" aria-label="منصة ترتيب قابلة للتكبير والتمرير الأفقي" aria-describedby="results-podium-help">
      <div className="results-podium-scroll-space" style={{ width: Math.max(width, 1220 * scale + 24), height: 580 * scale + 32 }}>
        <ol className="results-podium-scene" style={{ transform: `scale(${scale})` }} aria-label="ترتيب الأوائل حسب رصيد التقييمات">
          {[...positions].sort((a, b) => a.rank - b.rank).map(position => {
            const employee = employees[position.rank - 1];
            const reward = employee ? rewards?.[employee.id] : undefined;
            const front = <div className="results-platform-front" data-tier={reward?.tier || 'bronze'}>
              <span className="results-platform-rank" aria-label={`المركز ${position.rank}`}>{position.rank.toLocaleString('ar-SA')}</span>
              <span className="results-platform-name" style={{ fontSize: employee ? Math.max(8, Math.min(13, 240 / employee.name.length)) : undefined }}>{employee?.name || 'لا توجد موظفة'}</span>
              <span className="results-platform-branch" style={{ fontSize: employee ? Math.max(8, Math.min(11, 210 / employee.branch.length)) : undefined }}>{employee?.branch || '—'}</span>
              <span className="results-platform-reward">{employee ? reward ? `${money(reward.total)} ريال` : 'المكافأة غير متاحة' : '—'}</span>
            </div>;
            return <li key={position.rank} className="results-platform" style={{ left: position.x, top: position.y, zIndex: position.y + 1 }} data-rank={position.rank}>
              <div className="results-platform-avatar">{employee && renderAvatar(employee)}</div>
              <div className="results-platform-block">
                <div className="results-platform-top" aria-hidden="true" />
                <div className="results-platform-side" aria-hidden="true" />
                {employee ? renderEmployee(employee, front) : front}
              </div>
            </li>;
          })}
        </ol>
      </div>
    </div>
    <footer className="results-podium-footer">
      <p><span className="results-rate-dot results-rate-gold" /> الذهبية: ١٤ ريال <span className="results-rate-divider">/</span><span className="results-rate-dot results-rate-silver" /> الفضية: ١٠ ريالات <span>لكل رصيد تقييم</span></p>
      <p>{!rewards ? 'إعدادات المكافآت غير متاحة؛ تحققي من الاتصال قبل اعتماد النتائج.' : rounding ? 'نظام الجبر مفعّل · حد أدنى ١٠٠ ريال للمستحقات؛ قد تتجاوز الزيادة ٢٠ ريال لضمان الحد الأدنى.' : 'نظام الجبر متوقف · المكافآت بحسب النقاط ورصيد التقييمات الفعلي.'}</p>
    </footer>
  </main>;
}
