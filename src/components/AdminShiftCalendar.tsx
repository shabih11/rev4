import { useState } from 'react';
import { useData } from '../context/DataContext';
import { ShiftCalendar } from './ShiftCalendar';
import { formatDate, formatTime, shiftName, timeMinutes } from '../lib/formatDate';
import { reviewTimestamp } from '../lib/employeeActivity';
import { isCoverageEmployee } from '../lib/employeeBranches';

export function AdminShiftCalendar({ branch }: { branch: string }) {
  const { users, timeline, reviews, recordsReady, syncError, syncStatus, currentAccount, updateUser, updateTimelineEvent } = useData();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const shifts = timeline.filter(shift => shift.type === 'shift' && shift.branch === branch);
  const dayShifts = shifts.filter(shift => shift.date === selectedDate)
    .sort((a, b) => (timeMinutes(a.time) ?? 0) - (timeMinutes(b.time) ?? 0));
  const dayReviews = selectedDate ? reviews.filter(review => review.branch === branch &&
    reviewTimestamp({ date: review.date }) === reviewTimestamp({ date: selectedDate })) : [];
  const eligibleEmployees = users.filter(employee => employee.role === 'employee' &&
    (employee.branch === branch || employee.assignedBranches?.includes(branch)));

  const coverageEmployees = users.filter(employee => employee.role === 'employee' && isCoverageEmployee(employee));
  const branchEmployees = eligibleEmployees.filter(employee => !coverageEmployees.some(coverage => coverage.id === employee.id));
  const saving = syncStatus === 'جارٍ حفظ التعديلات…';

  function enableCoverage(employeeId: string) {
    const employee = coverageEmployees.find(item => item.id === employeeId);
    if (!employee || !recordsReady || syncError || saving || currentAccount?.role !== 'admin') return;
    updateUser(employee.id, { assignedBranches: [...new Set([...(employee.assignedBranches || []), branch])] });
  }

  function saveEmployees() {
    const shift = shifts.find(item => item.id === editingId && item.date === selectedDate);
    if (!recordsReady || syncError || saving || !shift) { setError('تعذر الحفظ؛ تحققي من اكتمال التحميل والمزامنة.'); return; }
    if (!employeeIds.length) { setError('اختاري موظفة واحدة على الأقل للشفت.'); return; }
    const employees = employeeIds.map(id => eligibleEmployees.find(employee => employee.id === id));
    if (employees.some(employee => !employee)) { setError('أزيلي الموظفات غير المسندات لهذا الفرع قبل الحفظ.'); return; }
    updateTimelineEvent(shift.id, { employees: employees.map(employee => ({ id: employee!.id, name: employee!.name })) });
    setEditingId(null);
    setError('');
  }

  if (!recordsReady) return <p role="status">{syncError || 'جارٍ تحميل الشفتات والتقييمات…'}</p>;
  return <div className="space-y-5" dir="rtl">
    {syncError && <p role="alert" className="text-red-700">{syncError}</p>}
    <ShiftCalendar shifts={shifts} unlinkedReviewDates={reviews.filter(review => review.branch === branch && !review.linkedEmployeeIds.length).map(review => review.date)} onSelect={date => { setSelectedDate(date); setEditingId(null); setError(''); }} />
    {!selectedDate ? <p className="text-center text-slate-500">اختاري يومًا لعرض الموظفات والتقييمات وتعديل الشفتات.</p> :
      <section className="bg-white rounded-3xl border p-4 sm:p-6 space-y-5" aria-label={`تفاصيل يوم ${formatDate(selectedDate)}`}>
        <h3 className="text-xl font-bold">{formatDate(selectedDate)} — فرع {branch}</h3>
        {dayShifts.length === 0 && <p className="text-slate-500">لا توجد شفتات مسجلة لهذا اليوم.</p>}
        {dayShifts.map(shift => <article key={shift.id} className="rounded-2xl border border-indigo-100 p-4 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div><h4 className="font-bold">{shiftName(shift.time)}</h4><p className="text-sm text-slate-500">{formatTime(shift.time)} – {shift.endTime ? formatTime(shift.endTime) : 'نهاية اليوم'}</p></div>
            <button type="button" className="rounded-xl bg-indigo-50 text-indigo-700 px-3 py-2 font-bold" onClick={() => { setEditingId(shift.id); setEmployeeIds([...new Set(shift.employees?.map(employee => employee.id) || [])]); setError(''); }}>تعديل موظفات الشفت</button>
          </div>
          <div className="flex flex-wrap gap-2">{shift.employees?.map(employee => <span key={employee.id} className="rounded-lg bg-slate-100 px-3 py-1 font-bold">{users.find(user => user.id === employee.id)?.name || employee.name}</span>)}</div>
          <p className="text-sm text-slate-600">{reviews.filter(review => review.branch === branch && review.linkedShiftId === shift.id).length} تقييمات مرتبطة بالشفت</p>
          {editingId === shift.id && <fieldset className="border-t pt-4 space-y-3">
            <legend className="font-bold">الموظفات المسجلات في الشفت</legend>
            <div className="max-h-64 overflow-y-auto grid sm:grid-cols-2 gap-2">
              {branchEmployees.map(employee => <label key={employee.id} className="flex items-center gap-2 rounded-xl border p-3 cursor-pointer">
                <input type="checkbox" checked={employeeIds.includes(employee.id)} onChange={event => setEmployeeIds(ids => event.target.checked ? [...ids, employee.id] : ids.filter(id => id !== employee.id))} />
                <span>{employee.name}{isCoverageEmployee(employee) ? ' (تغطية)' : ''}</span>
              </label>)}
              {employeeIds.filter(id => !eligibleEmployees.some(employee => employee.id === id)).map(id => <label key={id} className="flex items-center gap-2 rounded-xl border p-3">
                <input type="checkbox" checked onChange={() => setEmployeeIds(ids => ids.filter(value => value !== id))} />
                <span>{shift.employees?.find(employee => employee.id === id)?.name} — غير مسندة للفرع؛ أزيليها قبل الحفظ</span>
              </label>)}
            </div>
            <details className="rounded-2xl border border-indigo-100 p-3" open>
              <summary className="font-bold cursor-pointer text-indigo-800">موظفات التغطية (المصدر الخارجي)</summary>
              <p className="text-xs text-slate-500 my-2">يمكن اختيار المسندات لهذا الفرع مباشرة. إتاحة موظفة تغطية تضيف الفرع إلى فروعها المسموحة، ثم يمكنك اختيارها بعد اكتمال المزامنة.</p>
              <div className="max-h-64 overflow-y-auto grid sm:grid-cols-2 gap-2">
                {coverageEmployees.map(employee => eligibleEmployees.some(item => item.id === employee.id) ?
                  <label key={employee.id} className="flex items-center gap-2 rounded-xl border p-3 cursor-pointer">
                    <input type="checkbox" checked={employeeIds.includes(employee.id)} onChange={event => setEmployeeIds(ids => event.target.checked ? [...ids, employee.id] : ids.filter(id => id !== employee.id))} />
                    <span>{employee.name} <span className="text-xs text-slate-500">(تغطية)</span></span>
                  </label> :
                  <div key={employee.id} className="rounded-xl border p-3 space-y-2">
                    <p>{employee.name} <span className="text-xs text-slate-500">(تغطية)</span></p>
                    <button type="button" disabled={saving || Boolean(syncError) || currentAccount?.role !== 'admin'} onClick={() => enableCoverage(employee.id)} className="text-sm font-bold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 disabled:opacity-50" aria-label={`إتاحة ${employee.name} للتغطية في ${branch}`}>إتاحة التغطية لهذا الفرع</button>
                  </div>)}
              </div>
              {!coverageEmployees.length && <p className="text-sm text-slate-500 mt-2">لا توجد موظفات تغطية مسجلات.</p>}
            </details>
            {!branchEmployees.length && <p className="text-sm text-slate-500">لا توجد موظفات فرع؛ يمكنك اختيار موظفات التغطية.</p>}
            {error && <p role="alert" className="text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={!recordsReady || Boolean(syncError) || saving} onClick={saveEmployees} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold disabled:opacity-50">حفظ الموظفات</button>
              <button type="button" onClick={() => { setEditingId(null); setError(''); }} className="border px-4 py-2 rounded-xl">إلغاء</button>
            </div>
          </fieldset>}
        </article>)}
        <p role="status" className="text-sm text-slate-500">{syncStatus}</p>
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-bold">تقييمات اليوم ({dayReviews.length})</h4>
          {!dayReviews.length && <p className="text-slate-500">لا توجد تقييمات في هذا اليوم.</p>}
          {dayReviews.map(review => <article key={review.id} className="rounded-xl border p-3 space-y-1">
            <p className="font-bold">{review.rating} / 5 <span className="text-sm font-normal text-slate-500">— {formatTime(review.time)}</span></p>
            {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
            <p className="text-sm text-slate-500">{review.linkedEmployeeIds.map(id => users.find(employee => employee.id === id)?.name).filter(Boolean).join('، ') || 'غير مرتبطة بموظفة'}</p>
          </article>)}
        </div>
      </section>}
  </div>;
}
