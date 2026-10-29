import { canRequestShift, canAppeal } from '../lib/shiftRequestWindow';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRecordScope } from '../hooks/useRecordScope';
import { useAuth } from '../context/AuthContext';
import { useData, type TimelineEvent } from '../context/DataContext';
import { ShiftCalendar } from './ShiftCalendar';
import { timeMinutes } from '../lib/formatDate';

export function AdministrationPhone() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  return <form className="bg-white p-5 rounded-xl mb-6" onSubmit={async e => {
    e.preventDefault();
    if (!/^[1-9][0-9]{7,14}$/.test(phone)) { setMessage('أدخلي الرقم الدولي دون + أو مسافات'); return; }
    try { const { error } = await supabase.from('management_contact').upsert({ id: 'administration', phone }); if (error) throw error; setMessage('تم حفظ رقم الإدارة'); }
    catch { setMessage('تعذر حفظ الرقم'); }
  }}><label className="block font-bold">رقم واتساب الإدارة للتصعيد<input required type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9665xxxxxxxx" className="border rounded p-2 mx-2" /></label><button className="action-primary mt-2">حفظ رقم الإدارة</button><p role="status">{message}</p></form>;
}

export function MissingShiftRequest() {
  const { user } = useAuth();
  const { timeline, addTimelineEvent, recordsReady, syncError } = useData();
  useRecordScope({ timeline: { branches: [user?.branch || ''] } });
  const shifts = { rows: timeline.filter(event => event.type === 'shift' && event.branch === user?.branch), ready: recordsReady, error: syncError };
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  if (!user) return null;
  const requests = timeline.filter(t => t.requestStatus && t.employees?.some(e => e.id === user.id));
  async function escalate(request: TimelineEvent) {
    if (!canAppeal(request.rejectedAt)) { setMessage('انتهت مهلة الاستئناف (ثلاثة أيام من الرفض)'); return; }
    try {
      const { data: settings, error } = await supabase.from('management_contact').select('phone').eq('id', 'administration').maybeSingle();
      if (error) throw error;
      const phone = settings?.phone;
      if (typeof phone !== 'string' || !/^[1-9][0-9]{7,14}$/.test(phone)) { setMessage('لم يتم إعداد رقم الإدارة بعد'); return; }
      const text = `طلب تصعيد تسجيل شفت مفقود\nالموظفة: ${user!.name}\nالفرع: ${request.branch}\nالتاريخ: ${request.date}\nالشفت: ${request.requestedShift === 'first' ? 'الأول' : 'الثاني'}\nرقم الطلب: ${request.id}\nلم يتم قبول طلب إضافة الشفت من مديرة الفرع. أرجو مراجعته.`;
      if (!canAppeal(request.rejectedAt)) { setMessage('انتهت مهلة الاستئناف'); return; }
      window.location.assign(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
    } catch { setMessage('تعذر تحميل رقم الإدارة'); }
  }
  return <div className="space-y-4">
    <p className="text-sm text-gray-500">متاح لاخر ثلاثة ايام</p>
    {shifts.error || syncError ? <p role="alert">تعذر تحميل الشفتات والطلبات</p> : !shifts.ready || !recordsReady ? <p role="status">جارٍ تحميل الشفتات والطلبات…</p> : <ShiftCalendar shifts={shifts.rows} highlightEmployeeId={user.id} onSelect={setSelected} />}
    {selected && <div role="dialog" aria-label={`شفتات ${selected}`} className="relative bg-white rounded-3xl shadow-xl border p-5 after:absolute after:-top-3 after:right-8 after:border-x-[12px] after:border-x-transparent after:border-b-[12px] after:border-b-white">
      <button aria-label="إغلاق تفاصيل اليوم" onClick={() => setSelected('')} className="float-left">✕</button><h3 className="font-bold mb-3">{selected}</h3>
      {(['first','second'] as const).map(slot => {
        const assigned = shifts.rows.filter(s => s.date === selected && ((timeMinutes(s.time) ?? 0) < 960) === (slot === 'first')).flatMap(s => s.employees || []);
        const already = assigned.some(e => e.id === user.id);
        const pending = requests.some(r => r.date === selected && r.requestedShift === slot && r.requestStatus !== 'rejected');
        return <div key={slot} className="border-t py-3"><strong>الشفت {slot === 'first' ? 'الأول' : 'الثاني'}</strong><p className="my-2">{assigned.map(e => e.name).join('، ') || 'لا توجد موظفات مسجلات'}</p><button disabled={!canRequestShift(selected) || already || pending || !recordsReady || !!syncError} className="action-primary" onClick={() => {
          if (!canRequestShift(selected)) { setMessage('التذكير متاح لاخر ثلاثة ايام فقط'); return; }
          addTimelineEvent({ branch: user.branch, type: 'gap', title: `طلب تسجيل شفت مفقود - ${user.name}`, date: selected, time: slot === 'first' ? '10:00' : '16:00', employees: [{ id: user.id, name: user.name }], requestedShift: slot, requestStatus: 'pending' });
          setMessage('أُضيف الطلب للمزامنة مع مديرة الفرع');
        }}>{already ? 'أنتِ مسجلة في هذا الشفت' : pending ? 'يوجد طلب لهذا الشفت' : 'تذكير المديرة بتسجيلي في هذا الشفت'}</button></div>;
      })}
    </div>}
    <p role="status">{message}</p>
    {requests.map(r => <div key={r.id} className="bg-blue-50 p-4 rounded-xl"><strong>{r.date} — الشفت {r.requestedShift === 'first' ? 'الأول' : 'الثاني'}</strong><p>{r.requestStatus === 'rejected' ? 'لم يتم قبول طلب إضافة الشفت من مديرة الفرع' : r.requestStatus === 'accepted' ? 'تم قبول طلب تسجيل الشفت' : 'الطلب بانتظار قرار مديرة الفرع'}</p>{r.requestStatus === 'rejected' && <button disabled={!canAppeal(r.rejectedAt)} onClick={() => void escalate(r)} className="text-blue-700 underline p-2 disabled:opacity-40">{canAppeal(r.rejectedAt) ? 'تصعيد عبر واتساب' : 'انتهت مهلة الاستئناف'}</button>}</div>)}
  </div>;
}
