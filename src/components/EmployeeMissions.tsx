import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Flag, Star, Trophy } from 'lucide-react';
import { useData } from '../context/DataContext';
import { employeeMissions, levelCost } from '../lib/employeeMissions';
import { formatDate } from '../lib/formatDate';

const number = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

export function EmployeeMissions({ employeeId }: { employeeId: string }) {
  const { reviewSummaries, summaryReady, syncError, resultsMode } = useData();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  const state = useMemo(() => employeeMissions(employeeId, reviewSummaries, now), [employeeId, reviewSummaries, now]);
  if (resultsMode) return <section aria-label="رحلة الإنجاز" className="mx-6 mb-6 rounded-3xl border bg-white p-6">
    <h2 className="text-xl font-black">رحلة الإنجاز</h2>
    <p className="mt-2 text-sm text-slate-600">تعود المهام والمستويات عند عرض الشهر الحالي. أنتِ الآن في عرض نتائج الشهر الماضي.</p>
  </section>;
  if (!summaryReady || syncError) return <section aria-label="رحلة الإنجاز" className="mx-6 mb-6 rounded-3xl border bg-white p-6" aria-busy={!summaryReady && !syncError}>
    <h2 className="text-xl font-black">رحلة الإنجاز</h2>
    {syncError ? <p role="alert" className="mt-2 text-red-700">تعذر تحميل المهام والإنجازات. حاولي تحديث الصفحة.</p> : <p role="status" className="mt-2 text-slate-600">جارٍ تحميل مهامك وإنجازاتك…</p>}
  </section>;
  return <section aria-label="رحلة الإنجاز" className="mx-6 mb-8 overflow-hidden rounded-3xl border border-cyan-200 bg-white">
    <header className="bg-cyan-950 p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-xl font-black"><Flag aria-hidden="true" size={22} />رحلة الإنجاز</h2>
          <p className="mt-2 text-sm text-cyan-100">نجومك تصنع مستواك · {formatDate(state.today)}</p></div>
        <p className="flex items-center gap-2 rounded-full bg-cyan-900 px-3 py-2 font-black text-amber-200"><Trophy aria-hidden="true" size={20} />المستوى {number(state.level.level)}</p>
      </div>
      <div className="mt-5 flex justify-between gap-3 text-sm"><span>نحو المستوى {number(state.level.level + 1)}</span><span>{number(state.level.current)} / {number(state.level.required)} نجمة</span></div>
      <div role="progressbar" aria-label="تقدم المستوى" aria-valuemin={0} aria-valuemax={state.level.required} aria-valuenow={state.level.current} className="mt-2 h-3 overflow-hidden rounded-full bg-cyan-800">
        <div className="h-full rounded-full bg-amber-300" style={{ width: `${state.level.current / state.level.required * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-cyan-100">باقي {number(state.level.remaining)} نجمة للارتقاء · مجموعك {number(state.stars)} نجمة</p>
    </header>
    <div className="p-5 sm:p-6">
      <dl className="mb-5 grid grid-cols-2 gap-3 border-b border-slate-100 pb-5 text-sm">
        <div><dt className="text-slate-500">نجوم التقييمات</dt><dd className="mt-1 font-black text-cyan-900">{number(state.ratingStars)}</dd></div>
        <div><dt className="text-slate-500">مكافآت المهام</dt><dd className="mt-1 font-black text-amber-800">{number(state.bonusStars)}</dd></div>
      </dl>
      <p className="mb-4 text-xs leading-6 text-slate-600">كل نجمة من تقييم إيجابي مستورد تضيف نقطة لمستواك. تُقسّم نجوم التقييم المشترك بالتساوي. المهام تضيف نجومًا إضافية بحسب المجهود التقديري، وتكتمل تلقائيًا بعد المزامنة.</p>
      {(['daily', 'monthly'] as const).map(period => <div key={period} className="mb-5">
        <h3 className="flex items-center justify-between gap-2 font-black text-slate-800">{period === 'daily' ? 'تحدي اليوم' : 'مهام الشهر'}<span className="text-xs font-normal text-slate-500">{state.missions.filter(mission => mission.period === period && mission.current + 1e-9 >= mission.target).length}/{state.missions.filter(mission => mission.period === period).length} مكتملة</span></h3>
        <div className="divide-y divide-slate-100">{state.missions.filter(mission => mission.period === period).map(mission => {
          const done = mission.current + 1e-9 >= mission.target;
          return <details key={`${state.today}-${mission.id}`} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-50 text-cyan-800'}`} aria-hidden="true">{done ? <Check size={20} /> : <Star size={20} />}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-slate-800">{mission.title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{mission.description}</span>
                <span className={`mt-1 block text-xs font-bold ${done ? 'text-emerald-700' : 'text-cyan-800'}`}>{done ? 'مكتملة' : 'عرض المهمة'} · {number(mission.current)}/{number(mission.target)} · +{number(mission.stars)} نجمة للمستوى</span></span>
              <ChevronDown aria-hidden="true" className="shrink-0 text-slate-500 group-open:rotate-180" size={18} />
            </summary>
            <div className="mt-2 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600"><p className="mb-1 font-bold">{mission.effort}</p><p>{mission.hint}</p></div>
          </details>;
        })}</div>
      </div>)}
      <details className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-950">
        <summary className="cursor-pointer rounded font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700">كيف تُحسب المستويات والمكافآت؟</summary>
        <p className="mt-3 leading-7">التقييم الإيجابي هو 4 أو 5 نجوم؛ تقييم 5 نجوم فردي يعطيكِ 5 نقاط، ومع شريكة يعطي كل واحدة 2.5 نقطة. نجوم المهام مكافأة إضافية وليست تقييمات جديدة. قد يخدم التقييم أكثر من مهمة، ولكل مهمة مكافأة واحدة في فترتها. تقدير المجهود مبني على العدد والاستمرارية والتعاون، ولا يقيس وقت العمل الفعلي.</p>
        <p className="mt-3 leading-7">يبدأ المستوى من 1. يتضاعف المطلوب لكل انتقال حتى الوصول إلى المستوى 10، ثم يزيد 30٪ لكل انتقال مع التقريب للأعلى. تنتقل النجوم الزائدة إلى المستوى التالي.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-right text-xs"><caption className="mb-2 text-right font-bold">نجوم كل انتقال</caption><thead><tr><th scope="col" className="py-2">من ← إلى</th><th scope="col">النجوم المطلوبة</th></tr></thead><tbody>{Array.from({ length: 11 }, (_, index) => index + 1).map(level => <tr key={level} className="border-t border-cyan-100"><td className="py-2">{number(level)} ← {number(level + 1)}</td><td>{number(levelCost(level))}</td></tr>)}</tbody></table></div>
        <p className="mt-3 leading-7">يتجدد تحدي اليوم عند منتصف الليل بتوقيت الرياض، وتتجدد مهام الشهر في بدايته. يبقى المستوى ومجموع النجوم عبر الأشهر حسب السجلات المستوردة المتاحة، ويُعاد حسابهما عند تصحيح التقييمات أو حذفها.</p>
      </details>
      <p className="mt-5 text-xs leading-6 text-slate-500">نقاط المستوى للتشجيع، ولا تغيّر نقاط التقييم الوظيفي أو المكافأة المالية. تظهر مهمة محو الأثر فقط عند وجود تقييم سلبي مستورد هذا الشهر.</p>
    </div>
  </section>;
}
