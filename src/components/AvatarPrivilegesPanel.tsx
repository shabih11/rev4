import { useEffect, useRef, useState } from 'react';
import { useRecordScope } from '../hooks/useRecordScope';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { monthOf } from '../lib/avatarPrivileges';
import { enrichEmployees } from '../lib/employeeMetrics';
import { isInCurrentMonth } from '../lib/reviewPeriod';
import { seaBranchName } from '../lib/seaMission';
import { AvatarEffectIcon } from './AvatarEffectBadge';
import type { UserAccount } from '../lib/mockData';

type Action = 'erase' | 'complete' | 'plus';
const labels: Record<Action, string> = { erase: 'إزالة تقييم سلبي', complete: 'تجاوز عتبة', plus: 'تقييمات بلس' };

export function AvatarPrivilegesPanel({ employee }: { employee: UserAccount }) {
  const { avatarPrivileges: state, features, reviews, reviewSummaries, users, timeline, syncError } = useData();
  const currentMonth = monthOf(new Date());
  const [period, setPeriod] = useState(currentMonth);
  const [action, setAction] = useState<Action | null>(null);
  const [reviewId, setReviewId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useRecordScope(action === 'plus' ? { reviews: { employeeIds: [employee.id] } } : {});
  const gold = features?.store?.goldEntitled === true;
  const months = [...new Set([currentMonth, ...(state?.purchaseMonths ?? [])])].sort().reverse();
  const colleagues = users.filter(user => user.role === 'employee' && user.branch === employee.branch && (gold || user.id === employee.id));
  const colleagueIds = new Set(colleagues.map(user => user.id));
  const seaUsed = state?.seaReturns.some(item => item.branch === seaBranchName(employee.branch));
  function monthData(month: string) {
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 9));
    const locked = !state || Boolean(syncError) || !state.purchaseMonths.includes(month) || state.closures.some(item => item.period === month);
    const used = (kind: string) => state?.uses.some(use => use.period === month && use.actor === employee.id && use.kind === kind);
    const negative = reviewSummaries.filter(review => ['1', '2', '١', '٢'].includes(review.rating) && isInCurrentMonth(review.date, date)
      && review.linkedEmployeeIds.length > 0
      && (gold ? review.linkedEmployeeIds.every(id => colleagueIds.has(id)) : review.linkedEmployeeIds.includes(employee.id))
      && !state?.uses.some(use => use.period === month && use.kind === 'erase' && use.reviewId === review.id && use.recipients.some(id => gold || id === employee.id)));
    const scored = month === currentMonth ? colleagues : enrichEmployees(colleagues, reviewSummaries, timeline, date, true, '', state);
    const thresholds = scored.filter(user => {
      const deficit = (user.points < 8 ? 8 : 11) - user.points;
      return deficit > 0 && deficit <= 0.5 + 1e-9 && !(features?.settings.rounding && deficit <= 0.20 + 1e-9);
    });
    const plus = reviewSummaries.filter(review => isInCurrentMonth(review.date, date) && ['4', '5', '٤', '٥'].includes(review.rating)
      && review.linkedEmployeeIds.includes(employee.id) && (review.avatarRewardEmployeeIds?.includes(employee.id) ?? review.goldPlus));
    return { locked, used, negative, thresholds, plus };
  }
  const data = monthData(period);
  const available = (kind: Action, month: string) => {
    const item = monthData(month);
    if (kind === 'plus') return item.plus.length > 0;
    return !item.locked && !item.used(kind) && (kind === 'erase' ? item.negative.length > 0 : item.thresholds.length > 0);
  };
  useEffect(() => {
    if (action && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!action) dialog.current?.close();
  }, [action]);
  function open(kind: Action) {
    setPeriod(months.find(month => available(kind, month)) ?? currentMonth);
    setReviewId(''); setTargetId(''); setMessage(''); setAction(kind);
  }
  async function execute(kind: 'erase' | 'complete' | 'sea') {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const result = kind === 'sea' ? await supabase.rpc('use_avatar_sea_return') : await supabase.rpc('use_avatar_privilege', {
        requested_month: period, requested_kind: kind, requested_target: kind === 'erase' ? reviewId : targetId,
      });
      if (result.error) throw result.error;
      setMessage('تم تطبيق الامتياز وحفظ أثره.');
      setReviewId(''); setTargetId('');
      window.dispatchEvent(new Event('rev4-cache-changed'));
    } catch { setMessage('لم يُطبق الامتياز. تحققي من أهلية الحالة وعدم استخدام الميزة أو إغلاق الشهر.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="امتيازات أفتارك" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="mb-3 flex items-center gap-2 font-black"><AvatarEffectIcon gold={gold} />امتيازات أفتارك</h3>
    <ul className="space-y-1">
      {(Object.keys(labels) as Action[]).map(kind => {
        const lit = months.some(month => available(kind, month));
        return <li key={kind}><button type="button" onClick={() => open(kind)} data-available={lit} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${lit ? 'bg-blue-50 text-[#142b54]' : 'text-slate-500 hover:bg-white/60'}`}>
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${lit ? 'bg-teal-500 shadow-[0_0_10px_#14b8a6]' : 'bg-slate-300'}`} />
          {labels[kind]}{lit && <span className="sr-only">، متاحة</span>}
        </button></li>;
      })}
    </ul>
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setAction(null); }} onClose={() => setAction(null)} aria-label={action ? labels[action] : 'امتيازات أفتارك'} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/40" dir="rtl">
      {action && <>
        <header className="mb-4 flex items-center justify-between gap-3"><h3 className="font-black">{labels[action]}</h3><button type="button" disabled={busy} onClick={() => setAction(null)} className="min-h-11 px-2 text-sm">إغلاق</button></header>
        {months.length > 1 && <label className="mb-4 block text-sm">شهر الاستحقاق <select aria-label="شهر الاستحقاق" disabled={busy} value={period} onChange={event => { setPeriod(event.target.value); setReviewId(''); setTargetId(''); setMessage(''); }} className="rounded-lg border bg-white p-2">{months.map(month => <option key={month}>{month}</option>)}</select></label>}
        {action === 'plus' ? <>
          <p className="mb-3 text-sm text-slate-600">تقييماتك المحتسبة بسعر 16 ريالًا للتقييم، مقسومة على المشاركات فيه.</p>
          {data.plus.length ? <ul className="space-y-2">{data.plus.map(review => {
            const detail = reviews.find(item => item.id === review.id);
            const members = [...new Set(review.linkedEmployeeIds)].sort();
            const cents = Math.floor(1600 / members.length) + Number(members.indexOf(employee.id) < 1600 % members.length);
            return <li key={review.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{detail?.reviewerName && `${detail.reviewerName} · `}{review.date} · {review.time}</p>{detail?.comment && <p className="my-2 whitespace-pre-wrap break-words">{detail.comment}</p>}<p>{review.linkedEmployeeIds.map(id => users.find(user => user.id === id)?.name || 'موظفة').join('، ')}</p><p className="mt-1 font-bold text-[#142b54]">حصتك {(cents / 100).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ريال</p></li>;
          })}</ul> : <p className="text-sm text-slate-500">لا توجد تقييمات بلس محتسبة لكِ في هذا الشهر.</p>}
        </> : data.locked ? <p className="text-sm text-slate-500">{state?.closures.some(item => item.period === period) ? 'أُغلقت مكافآت هذا الشهر.' : syncError ? 'تعذر التحقق من الاستحقاق. حاولي بعد تحديث البيانات.' : 'اشتري أفتارًا في هذا الشهر لفتح الامتيازات.'}</p> : <>
          {data.used(action) ? <p className="text-sm text-slate-500">استُخدمت هذه الميزة لهذا الشهر.</p> : action === 'erase' ? <>
            <p className="mb-3 text-sm">اختاري التقييم لإلغاء أثره على {gold ? 'جميع المشاركات فيه داخل فرعك' : 'نقاطك'}. يبقى التقييم محفوظًا، ويُستهلك استخدام المحو لهذا الشهر.</p>
            {data.negative.length ? <><select aria-label="التقييم السلبي المراد محو أثره" disabled={busy} value={reviewId} onChange={event => setReviewId(event.target.value)} className="mb-3 w-full rounded-lg border p-3 text-sm"><option value="">اختاري تقييمًا سلبيًا</option>{data.negative.map(review => <option key={review.id} value={review.id}>{review.date} · {review.linkedEmployeeIds.map(id => users.find(user => user.id === id)?.name || 'موظفة').join('، ')}</option>)}</select><button type="button" disabled={busy || !reviewId} className="action-primary" onClick={() => void execute('erase')}>{busy ? 'جارٍ التطبيق…' : 'تأكيد إزالة الأثر'}</button></> : <p className="text-sm text-slate-500">لا يوجد تقييم سلبي متاح لإزالة أثره.</p>}
          </> : <>
            <p className="mb-3 text-sm">اختاري الموظفة لتجاوز العتبة بنصف نقطة كحد أقصى، دون إضافة تقييمات أو عملات. يُستهلك استخدام الإكمال لهذا الشهر.</p>
            {data.thresholds.length ? <><select aria-label="الموظفة المراد إكمال استحقاقها" disabled={busy} value={targetId} onChange={event => setTargetId(event.target.value)} className="mb-3 w-full rounded-lg border p-3 text-sm"><option value="">اختاري الموظفة</option>{data.thresholds.map(user => <option key={user.id} value={user.id}>{user.name} · {user.points.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ← {user.points < 8 ? 8 : 11}</option>)}</select><button type="button" disabled={busy || !targetId} className="action-primary" onClick={() => void execute('complete')}>{busy ? 'جارٍ التطبيق…' : 'تأكيد تجاوز العتبة'}</button></> : <p className="text-sm text-slate-500">لا توجد موظفة على عتبة متاحة للتجاوز.</p>}
          </>}
          {action === 'complete' && gold && period === '2026-11-01' && <div className="mt-5 border-t pt-4"><p className="mb-2 text-sm">عودة إضافية واحدة لسفينة الفرع طوال مهمة البحر.</p><button type="button" disabled={busy || seaUsed} className="action-secondary" onClick={() => void execute('sea')}>{seaUsed ? 'استُخدمت عودة أم خماس للفرع' : 'استخدام عودة أم خماس'}</button></div>}
        </>}
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </>}
    </dialog>
  </section>;
}
