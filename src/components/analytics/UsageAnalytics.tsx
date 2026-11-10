import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
const pageNames: Record<string,string> = { leaderboard:'لوحة الترتيب',dashboard:'الرئيسية',avatar:'المتجر',profile:'الملف الشخصي',employees:'الموظفات',shifts:'الشفتات',branches:'الفروع',notes:'الملاحظات',stats:'التقييمات',features:'الميزات',avatars:'إدارة الأفتارات',analytics:'التحليلات' };
const kinds: Record<string,string> = { session_start:'بداية جلسة',session_end:'نهاية جلسة',page_view:'فتح صفحة',active:'وقت نشط',click:'نقرة' };
interface Employee { id:string; name:string; branch:string; has_account:boolean; disabled:boolean; events:number; sessions:number; views:number; clicks:number; active_seconds:number; active_days:number; last_seen:string|null; logins:number; failed_logins:number }
interface Page { page:string; views:number; reached:number; engaged:number; clicks:number; active_seconds:number }
interface Report { employees:Employee[]; pages:Page[]; events:{page:string;kind:string;action:string;seconds:number;received_at:string;session_id:string}[]; sessions:{session_id:string;started_at:string;last_seen:string;active_seconds:number;ended:boolean}[]; audit:{entity:string;operation:string;recorded_at:string;profile_id:string|null}[]; since:string }
const date = (value:string|null) => value ? new Date(value).toLocaleString('ar-SA', { timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short' }) : 'لم يُرصد';
const minutes = (n:number) => `${(n/60).toFixed(1)} د`;
export function UsageAnalytics({ branch, onBranchChange }: { branch: string; onBranchChange: (branch: string) => void }) {
 const [days,setDays]=useState(7),[target,setTarget]=useState(''),[inactive,setInactive]=useState(false);
 useEffect(()=>setTarget(''),[branch]);
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{ let alive=true; setReport(null); setError('');
 void supabase.rpc('get_usage_report',{days,target:target||null,requested_branch:branch||null}).then(({data,error})=>{if(alive){if(error)setError('تعذر تحميل التحليلات. تحققي من الاتصال والصلاحية.');else setReport(data as Report);}},()=>{if(alive)setError('تعذر تحميل التحليلات.');});
 return ()=>{alive=false;}; },[days,branch,target,refresh]);
 const employees=report?.employees||[];
 const eligible=employees.filter(e=>e.has_account&&!e.disabled);
 const reached=eligible.filter(e=>e.views>0).length, engaged=eligible.filter(e=>e.clicks>0||e.active_seconds>0).length;
 const percent=(n:number)=>eligible.length?`${Math.round(n/eligible.length*100)}٪`:'—';
 const selected=target?employees.find(e=>e.id===target):null;
 return <section dir="rtl" className="space-y-4 min-w-0" aria-label="تحليلات الاستخدام">
 <h2 className="text-xl font-black">تحليلات استخدام الموظفات</h2>
 <p className="text-sm text-slate-600">فتح الصفحة لا يثبت قراءتها. الوقت النشط تقديري أثناء ظهور الصفحة والتفاعل خلال آخر دقيقة. الاستيعاب غير مقاس؛ يحتاج مهمة أو سؤالاً موثوقاً. أوقات الأحداث هي أوقات استلامها بالخادم. البيانات تبدأ من تفعيل التتبع ولا تسترجع النشاط السابق.</p>
 <div className="flex flex-wrap gap-3 items-end">
 <label>الفترة<select aria-label="الفترة" className="block border rounded-lg p-2" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>٧ أيام</option><option value={30}>٣٠ يوماً</option><option value={90}>٩٠ يوماً</option></select></label>
 <label>الفرع<select aria-label="الفرع" className="block border rounded-lg p-2" value={branch} onChange={e=>{onBranchChange(e.target.value);setTarget('');}}><option value="">كل الفروع</option>{['جاليري','ذافيو','سلام','القصر','المملكة','شرق','موظفة خارجية'].map(b=><option key={b}>{b}</option>)}</select></label>
 <button className="border rounded-lg p-2" onClick={()=>setRefresh(x=>x+1)}>تحديث</button>
 {target&&<button className="border rounded-lg p-2" onClick={()=>setTarget('')}>كل الموظفات</button>}
 </div>
 {error?<p role="alert">{error}</p>:!report?<p role="status">جارٍ تحميل التحليلات…</p>:<>
 <p className="text-xs text-slate-500">من {date(report.since)} · بتوقيت الرياض · يُحتفظ بالاستخدام ٩٠ يوماً وبالتدقيق سنة.</p>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['الوصول',percent(reached)],['التفاعل',percent(engaged)],['حسابات مؤهلة',eligible.length],['لم يُرصد نشاط',eligible.filter(e=>e.events===0).length]].map(([label,value])=><div key={label} className="p-4 bg-white border rounded-2xl"><p className="text-sm">{label}</p><strong className="text-2xl">{value}</strong></div>)}</div>
 <p className="text-xs text-slate-600">النسب من حسابات الموظفات المفعّلة في الفرع والفترة المختارين. غياب النشاط المرصود قد ينتج عن انقطاع الاتصال، ولا يثبت عدم الاستخدام أو ضعف الأداء.</p>
 {!target&&!branch&&<div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-label="مقارنة الفروع">{[...new Set(eligible.map(e=>e.branch))].map(b=>{const group=eligible.filter(e=>e.branch===b);return <article key={b} className="p-3 border rounded-xl"><h3 className="font-bold">{b}</h3><p className="text-sm">الوصول {group.filter(e=>e.views>0).length} / {group.length} · التفاعل {group.filter(e=>e.clicks>0||e.active_seconds>0).length} / {group.length}</p></article>;})}</div>}
 {selected&&<div className="p-4 rounded-2xl bg-blue-50 space-y-2"><h3 className="font-bold">ملف {selected.name}</h3><p>{selected.branch} · آخر نشاط: {date(selected.last_seen)}</p><p>الدخول الناجح: {selected.logins} · محاولات فاشلة على الحساب: {selected.failed_logins}</p><p>جلسات الاستخدام: {selected.sessions} · أيام النشاط: {selected.active_days} · فتح الصفحات: {selected.views} · النقرات: {selected.clicks} · الوقت النشط: {minutes(selected.active_seconds)}</p></div>}
 {!target&&<><label className="flex gap-2"><input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>غير النشطات في الفترة فقط</label>
 <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{employees.filter(e=>!inactive||(e.has_account&&!e.disabled&&e.events===0)).map(e=><button data-usage-action="open_details" key={e.id} onClick={()=>setTarget(e.id)} className="p-4 border bg-white rounded-2xl text-right space-y-1"><strong>{e.name}</strong><p className="text-sm">{e.branch} · {!e.has_account?'بلا حساب دخول':e.disabled?'حساب معطّل':e.events?'نشاط مرصود':'لم يُرصد نشاط'}</p><p className="text-sm">{e.sessions} جلسة · {e.views} فتح · {minutes(e.active_seconds)}</p><p className="text-xs">آخر نشاط: {date(e.last_seen)}</p></button>)}</div>
 {!employees.length&&<p>لا توجد موظفات ضمن هذا النطاق.</p>}</>}
 <h3 className="font-bold">الوصول والتفاعل حسب الصفحة</h3><div className="grid sm:grid-cols-2 gap-3">{report.pages.map(p=><article key={p.page} className="p-4 border rounded-2xl bg-white"><h4 className="font-bold">{pageNames[p.page]||p.page}</h4><p>{p.views} فتح · الوصول: {p.reached} موظفة · التفاعل: {p.engaged} موظفة</p><p>{p.clicks} نقرة · {minutes(p.active_seconds)} وقت نشط</p></article>)}</div>{!report.pages.length&&<p>لا توجد أحداث مرصودة خلال الفترة.</p>}
 <p className="text-xs text-slate-600">الجلسة زيارة مستقلة لكل تبويب، وتتجدد بعد خمول ٣٠ دقيقة؛ ليست عدد مرات إدخال كلمة المرور. النقرات محددة على الأزرار المهمة فقط. محاولات الفشل تغطي مسار اسم المستخدم بعد التحقق من الحساب، ولا تشمل مسار البريد أو تثبت هوية من حاول الدخول.</p>
 {target&&<><h3 className="font-bold">آخر ١٠٠ جلسة</h3><div className="space-y-2">{report.sessions.map(s=><article key={s.session_id} className="p-3 border rounded-xl"><p>من {date(s.started_at)} إلى آخر رصد {date(s.last_seen)}</p><p>{minutes(s.active_seconds)} · {s.ended?'نهاية مرصودة':'نهاية تقديرية عند آخر نشاط'}</p></article>)}</div>
 <h3 className="font-bold">آخر ٢٠٠ حدث</h3><ol className="space-y-2">{report.events.map((e,i)=><li key={i} className="p-3 border rounded-xl text-sm">{kinds[e.kind]} · {pageNames[e.page]} · {e.seconds?minutes(e.seconds):''}<time className="block text-slate-500">{date(e.received_at)}</time></li>)}</ol></>}
 <details><summary className="font-bold cursor-pointer">تدقيق الإجراءات الحساسة — آخر ١٠٠ إجراء</summary><p className="text-xs">سجل خادمي للعمليات الناجحة، دون محتويات السجلات. في ملف الموظفة تُعرض الإجراءات التي نفّذتها. يشمل تغييرات الحسابات والصلاحيات والملفات والفروع والتقييمات والشفتات والإعدادات.</p><ul className="space-y-2">{report.audit.map((a,i)=><li key={i} className="p-2 border rounded-lg text-sm break-words">{a.entity} · {a.operation} · {a.profile_id||'عملية خادمية'} · {date(a.recorded_at)}</li>)}</ul></details>
 </>}
 </section>;
}
