import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';

interface ResultReport {
  id: string;
  reporter_profile_id: string;
  category: string;
  target_employee_id: string | null;
  description: string;
  results_period: string;
  created_at: string;
}

const PAGE_SIZE = 20;
const categories: Record<string, string> = {
  appeal: 'الاعتراض على نتيجتي',
  manipulation: 'الإبلاغ عن تلاعب',
  verify_employee: 'طلب التحقق من نتيجة موظفة أخرى',
};
const dateFormat = new Intl.DateTimeFormat('ar-SA', {
  calendar: 'gregory', timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short',
});
const periodFormat = new Intl.DateTimeFormat('ar-SA', {
  calendar: 'gregory', timeZone: 'Asia/Riyadh', month: 'long', year: 'numeric',
});

export function ResultReportsInbox() {
  const { currentAccount } = useData();
  // Remount on account changes so private reports never carry over to another session.
  return currentAccount?.role === 'admin' ? <AdminReports key={currentAccount.id} /> : null;
}

function AdminReports() {
  const { users, disabledEmployees } = useData();
  const [reports, setReports] = useState<ResultReport[]>([]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const directory = new Map([...disabledEmployees, ...users].map(user => [user.id, user]));

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    async function load() {
      try {
        const { data, error: failure } = await supabase.from('result_problem_reports')
          .select('id,reporter_profile_id,category,target_employee_id,description,results_period,created_at')
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
          .abortSignal(controller.signal);
        if (failure || !Array.isArray(data)) throw failure || new Error('invalid-response');
        if (!active) return;
        setReports(data.slice(0, PAGE_SIZE));
        setHasMore(data.length > PAGE_SIZE);
      } catch {
        if (active) { setReports([]); setError(true); }
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [page, revision]);

  function navigate(next: number) {
    setLoading(true); setError(false); setReports([]); setPage(next);
  }
  function refresh() {
    setLoading(true); setError(false); setReports([]); setPage(0); setRevision(value => value + 1);
  }

  const buttonClass = 'min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';
  return <section className="mb-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><ShieldCheck size={22} aria-hidden="true" />بلاغات الموظفات</h3>
        <p className="mt-2 text-sm text-slate-600">بلاغات النتائج من جميع الفروع، من الأحدث إلى الأقدم. سرية ومتاحة لمدير النظام فقط.</p>
      </div>
      <button type="button" disabled={loading} className={`${buttonClass} inline-flex items-center gap-2`} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />تحديث البلاغات</button>
    </div>
    <div aria-busy={loading}>
      {loading ? <div className="flex items-center gap-3 py-6 text-slate-600"><progress aria-label="تحميل بلاغات الموظفات" className="w-24" />جارٍ تحميل البلاغات…</div>
        : error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">تعذر تحميل البلاغات. اضغطي «تحديث البلاغات» لإعادة المحاولة.</p>
          : reports.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600">{page === 0 ? 'لم تصل بلاغات من الموظفات بعد.' : 'لا توجد بلاغات إضافية في هذه الصفحة.'}</p>
            : <ul role="list" className="grid gap-4">
              {reports.map(report => {
                const reporter = directory.get(report.reporter_profile_id);
                return <li key={report.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-bold text-blue-800">{categories[report.category] || 'بلاغ عن مشكلة'}</h4>
                    <time dateTime={report.created_at} className="text-xs text-slate-500">{dateFormat.format(new Date(report.created_at))}</time>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="inline text-slate-500">المرسلة: </dt><dd className="inline font-bold text-slate-800">{reporter?.name || 'حساب غير متاح'}</dd></div>
                    <div><dt className="inline text-slate-500">فرع المرسلة الحالي: </dt><dd className="inline text-slate-800">{reporter?.branch || 'غير متاح'}</dd></div>
                    <div><dt className="inline text-slate-500">فترة النتائج: </dt><dd className="inline text-slate-800">{periodFormat.format(new Date(`${report.results_period}T00:00:00+03:00`))}</dd></div>
                    {report.target_employee_id && <div><dt className="inline text-slate-500">الموظفة المطلوب التحقق من نتيجتها: </dt><dd className="inline font-bold text-slate-800">{directory.get(report.target_employee_id)?.name || 'حساب غير متاح'}</dd></div>}
                  </dl>
                  <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 leading-relaxed text-slate-800">{report.description}</p>
                </li>;
              })}
            </ul>}
    </div>
    <nav aria-label="صفحات بلاغات الموظفات" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <button type="button" disabled={loading || page === 0} className={buttonClass} onClick={() => navigate(page - 1)}>السابق</button>
      <p className="text-sm text-slate-600">الصفحة {(page + 1).toLocaleString('ar-SA')}</p>
      <button type="button" disabled={loading || error || !hasMore} className={buttonClass} onClick={() => navigate(page + 1)}>التالي</button>
    </nav>
  </section>;
}
