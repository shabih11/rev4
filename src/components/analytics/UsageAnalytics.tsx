import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
const pageNames: Record<string,string> = { leaderboard:'لوحة الترتيب',dashboard:'الرئيسية',avatar:'المتجر',profile:'الملف الشخصي',employees:'الموظفات',shifts:'الشفتات',branches:'الفروع',notes:'الملاحظات',stats:'التقييمات',features:'الميزات',avatars:'إدارة الأفتارات',analytics:'التحليلات' };
const kinds: Record<string,string> = { session_start:'بداية جلسة',session_end:'نهاية جلسة',page_view:'فتح صفحة',active:'وقت نشط',click:'نقرة' };
interface Employee { id:string; name:string; branch:string; has_account:boolean; disabled:boolean; events:number; sessions:number; views:number; clicks:number; active_seconds:number; active_days:number; last_seen:string|null; logins:number; failed_logins:number }
interface Page { page:string; views:number; reached:number; engaged:number; clicks:number; active_seconds:number }
interface Report { employees:Employee[]; pages:Page[]; events:{page:string;kind:string;action:string;seconds:number;received_at:string;session_id:string}[]; sessions:{session_id:string;started_at:string;last_seen:string;active_seconds:number;ended:boolean}[]; audit:{entity:string;operation:string;recorded_at:string;profile_id:string|null}[]; since:string }
const date = (value:string|null) => value ? new Date(value).toLocaleString('ar-SA', { timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short' }) : 'لم يُرصد';
const minutes = (n:number) => `${(n/60).toFixed(1)} د`;
type Metric = 'active_seconds' | 'views' | 'clicks';
const metricNames: Record<Metric, string> = { active_seconds: 'الوقت النشط', views: 'فتح الصفحات', clicks: 'النقرات' };
interface ChartItem { id: string; label: string; value: number; detail: string }
function ActivityChart({ title, items, metric, onSelect }: { title: string; items: ChartItem[]; metric: Metric; onSelect: (id: string) => void }) {
 const [expanded, setExpanded] = useState(false);
 const maximum = Math.max(1, ...items.map(item => item.value));
 return <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0">
 <h3 className="font-bold text-lg mb-1">{title}</h3><p className="text-xs text-slate-500 mb-5">الأكثر نشاطًا أولًا · اضغطي على الرسم لاستكشاف التفاصيل</p>
 <div className="space-y-3">{(expanded ? items : items.slice(0, 8)).map(item => <button key={item.id} onClick={() => onSelect(item.id)} className="block w-full text-right rounded-lg p-2 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`${item.label}، ${metricNames[metric]}: ${metric === 'active_seconds' ? minutes(item.value) : item.value}`}>
 <span className="flex justify-between gap-3 text-sm mb-2"><strong className="break-words min-w-0">{item.label}</strong><span className="shrink-0 tabular-nums text-blue-700">{metric === 'active_seconds' ? minutes(item.value) : item.value}</span></span>
 <span className="block h-4 rounded bg-slate-100 overflow-hidden"><span className="block h-full rounded bg-blue-600" style={{width: `${item.value / maximum * 100}%`}} /></span>
 <span className="block text-xs text-slate-500 mt-2">{item.detail}</span></button>)}</div>
 {!items.length && <p className="text-sm text-slate-500">لا يوجد نشاط مرصود ضمن هذا النطاق.</p>}
 {items.length > 8 && <button className="text-blue-700 border rounded-lg px-3 py-2 mt-4" onClick={() => setExpanded(value => !value)}>{expanded ? 'عرض أقل' : `عرض الجميع (${items.length})`}</button>}
 </article>;
}
function Ring({ label, count, total }: { label: string; count: number; total: number }) {
 const value = total ? Math.round(count / total * 100) : 0;
 return <div className="flex items-center gap-3 py-3"><div className="relative shrink-0 w-20 h-20"><svg viewBox="0 0 40 40" className="w-full h-full -rotate-90" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4"/><circle cx="20" cy="20" r="16" fill="none" stroke="#2563eb" strokeWidth="4" strokeDasharray={`${value} ${100-value}`} pathLength="100" strokeLinecap="round"/></svg><strong className="absolute inset-0 flex items-center justify-center text-sm">{total ? `${value}٪` : '—'}</strong></div><div><p className="font-bold">{label}</p><p className="text-xs text-slate-500">{count} من {total} حسابات مؤهلة</p></div></div>;
}
export function UsageAnalytics({ branch, onBranchChange }: { branch: string; onBranchChange: (branch: string) => void }) {
 const [metric, setMetric] = useState<Metric>('active_seconds');
 const [pageDetail, setPageDetail] = useState('');
 const [days,setDays]=useState(7),[target,setTarget]=useState(''),[inactive,setInactive]=useState(false);
 useEffect(()=>setTarget(''),[branch]);
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{ let alive=true; setReport(null); setError('');
 void supabase.rpc('get_usage_report',{days,target:target||null,requested_branch:branch||null}).then(({data,error})=>{if(alive){if(error)setError('تعذر تحميل التحليلات. تحققي من الاتصال والصلاحية.');else setReport(data as Report);}},()=>{if(alive)setError('تعذر تحميل التحليلات.');});
 return ()=>{alive=false;}; },[days,branch,target,refresh]);
 const employees=report?.employees||[];
 const eligible=employees.filter(e=>e.has_account&&!e.disabled);
 const reached=eligible.filter(e=>e.views>0).length, engaged=eligible.filter(e=>e.clicks>0||e.active_seconds>0).length;
 const rankedEmployees = [...employees].sort((a,b) => b[metric]-a[metric] || b.events-a.events || a.name.localeCompare(b.name, 'ar'));
 const rankedPages = [...(report?.pages || [])].sort((a,b) => b[metric]-a[metric] || b.views-a.views);
 const branches = [...new Set(eligible.map(e => e.branch))].map(name => { const group = eligible.filter(e => e.branch === name); return { id: name, label: name, value: group.reduce((sum,e) => sum + e[metric],0), detail: `${group.length} موظفات · ${group.filter(e=>e.views>0).length} وصلن للصفحات` }; }).sort((a,b)=>b.value-a.value || a.label.localeCompare(b.label, 'ar'));
 const selectedPage = report?.pages.find(p => p.page === pageDetail);
 const selected=target?employees.find(e=>e.id===target):null;
 return <section dir="rtl" className="space-y-4 min-w-0" aria-label="تحليلات الاستخدام">
 <h2 className="text-xl font-black">تحليلات استخدام الموظفات</h2>
 <p className="text-sm text-slate-600">فتح الصفحة لا يثبت قراءتها. الوقت النشط تقديري أثناء ظهور الصفحة والتفاعل خلال آخر دقيقة. الاستيعاب غير مقاس؛ يحتاج مهمة أو سؤالاً موثوقاً. أوقات الأحداث هي أوقات استلامها بالخادم. البيانات تبدأ من تفعيل التتبع ولا تسترجع النشاط السابق.</p>
 <div className="flex flex-wrap gap-3 items-end">
 <label>الفترة<select aria-label="الفترة" className="block border rounded-lg p-2" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>٧ أيام</option><option value={30}>٣٠ يوماً</option><option value={90}>٩٠ يوماً</option></select></label>
 <label>الفرع<select aria-label="الفرع" className="block border rounded-lg p-2" value={branch} onChange={e=>{onBranchChange(e.target.value);setTarget('');}}><option value="">كل الفروع</option>{['جاليري','ذافيو','سلام','القصر','المملكة','شرق','موظفة خارجية'].map(b=><option key={b}>{b}</option>)}</select></label>
 <label>مقياس النشاط<select aria-label="مقياس النشاط" className="block border rounded-lg p-2" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{(Object.keys(metricNames) as Metric[]).map(key=><option key={key} value={key}>{metricNames[key]}</option>)}</select></label>
 <button className="border rounded-lg p-2" onClick={()=>setRefresh(x=>x+1)}>تحديث</button>
 {target&&<button className="border rounded-lg p-2" onClick={()=>setTarget('')}>كل الموظفات</button>}
 </div>
 {error?<p role="alert">{error}</p>:!report?<p role="status">جارٍ تحميل التحليلات…</p>:<>
 <p className="text-xs text-slate-500">من {date(report.since)} · بتوقيت الرياض · يُحتفظ بالاستخدام ٩٠ يوماً وبالتدقيق سنة.</p>
 <div className="grid sm:grid-cols-3 gap-4 border rounded-2xl bg-white px-5"><Ring label="الوصول" count={reached} total={eligible.length}/><Ring label="التفاعل" count={engaged} total={eligible.length}/><Ring label="لم يُرصد نشاط" count={eligible.filter(e=>e.events===0).length} total={eligible.length}/></div>
 <p className="text-xs text-slate-600">النسب من الحسابات المفعّلة. غياب النشاط المرصود لا يثبت عدم الاستخدام أو ضعف الأداء. الترتيب حسب المقياس المختار، والوقت النشط هو الافتراضي.</p>
 {!target&&!branch&&<ActivityChart title="نشاط الفروع" metric={metric} items={branches} onSelect={id=>{onBranchChange(id);setTarget('');}}/>}
 {selected&&<div className="p-4 rounded-2xl bg-blue-50 space-y-2"><h3 className="font-bold">ملف {selected.name}</h3><p>{selected.branch} · آخر نشاط: {date(selected.last_seen)}</p><p>الدخول الناجح: {selected.logins} · محاولات فاشلة على الحساب: {selected.failed_logins}</p><p>جلسات الاستخدام: {selected.sessions} · أيام النشاط: {selected.active_days} · فتح الصفحات: {selected.views} · النقرات: {selected.clicks} · الوقت النشط: {minutes(selected.active_seconds)}</p></div>}
 {!target&&<><label className="flex gap-2"><input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>غير النشطات في الفترة فقط</label>
 <ActivityChart title="نشاط الموظفات" metric={metric} items={rankedEmployees.filter(e=>!inactive||(e.has_account&&!e.disabled&&e.events===0)).map(e=>({id:e.id,label:e.name,value:e[metric],detail:`${e.branch} · ${!e.has_account?'بلا حساب دخول':e.disabled?'حساب معطّل':`${e.sessions} جلسة · ${e.active_days} أيام نشاط`} · آخر نشاط: ${date(e.last_seen)}`}))} onSelect={setTarget}/>
 </>}
 <ActivityChart title="الوصول والتفاعل حسب الصفحة" metric={metric} items={rankedPages.map(p=>({id:p.page,label:pageNames[p.page]||p.page,value:p[metric],detail:`الوصول: ${p.reached} موظفة · التفاعل: ${p.engaged} موظفة`}))} onSelect={setPageDetail}/>
 {selectedPage&&<aside className="border border-blue-200 bg-blue-50 rounded-xl p-4" aria-live="polite"><div className="flex justify-between gap-3"><h3 className="font-bold">{pageNames[selectedPage.page]||selectedPage.page}</h3><button onClick={()=>setPageDetail('')} className="text-blue-700">إغلاق التفاصيل</button></div><p className="mt-2 text-sm">{selectedPage.views} فتح · {selectedPage.clicks} نقرة · {minutes(selectedPage.active_seconds)} وقت نشط</p><div className="flex flex-wrap gap-6"><Ring label="الوصول" count={selectedPage.reached} total={eligible.length}/><Ring label="التفاعل" count={selectedPage.engaged} total={eligible.length}/></div></aside>}
 <p className="text-xs text-slate-600">الجلسة زيارة مستقلة لكل تبويب، وتتجدد بعد خمول ٣٠ دقيقة؛ ليست عدد مرات إدخال كلمة المرور. النقرات محددة على الأزرار المهمة فقط. محاولات الفشل تغطي مسار اسم المستخدم بعد التحقق من الحساب، ولا تشمل مسار البريد أو تثبت هوية من حاول الدخول.</p>
 {target&&<><h3 className="font-bold">آخر ١٠٠ جلسة</h3><div className="space-y-2">{report.sessions.map(s=><article key={s.session_id} className="p-3 border rounded-xl"><p>من {date(s.started_at)} إلى آخر رصد {date(s.last_seen)}</p><p>{minutes(s.active_seconds)} · {s.ended?'نهاية مرصودة':'نهاية تقديرية عند آخر نشاط'}</p></article>)}</div>
 <h3 className="font-bold">آخر ٢٠٠ حدث</h3><ol className="space-y-2">{report.events.map((e,i)=><li key={i} className="p-3 border rounded-xl text-sm">{kinds[e.kind]} · {pageNames[e.page]} · {e.seconds?minutes(e.seconds):''}<time className="block text-slate-500">{date(e.received_at)}</time></li>)}</ol></>}
 <details><summary className="font-bold cursor-pointer">تدقيق الإجراءات الحساسة — آخر ١٠٠ إجراء</summary><p className="text-xs">سجل خادمي للعمليات الناجحة، دون محتويات السجلات. في ملف الموظفة تُعرض الإجراءات التي نفّذتها. يشمل تغييرات الحسابات والصلاحيات والملفات والفروع والتقييمات والشفتات والإعدادات.</p><ul className="space-y-2">{report.audit.map((a,i)=><li key={i} className="p-2 border rounded-lg text-sm break-words">{a.entity} · {a.operation} · {a.profile_id||'عملية خادمية'} · {date(a.recorded_at)}</li>)}</ul></details>
 </>}
 </section>;
}
