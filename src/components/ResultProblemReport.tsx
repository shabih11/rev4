import { useId, useRef, useState } from 'react';
import { CheckCircle2, Flag, ShieldCheck, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import './ResultProblemReport.css';

const categories = [
  ['appeal', 'الاعتراض على نتيجتي'],
  ['manipulation', 'الإبلاغ عن تلاعب'],
  ['verify_employee', 'طلب التحقق من نتيجة موظفة أخرى'],
] as const;

export function ResultProblemReport() {
  const { users, currentAccount, resultsDate } = useData();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const requestId = useRef('');
  const id = useId();
  const [category, setCategory] = useState('');
  const [employee, setEmployee] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  if (!currentAccount || currentAccount.role === 'viewer') return null;
  const employees = users.filter(user => user.role === 'employee' && user.id !== currentAccount.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!description.trim()) {
      setError('اكتبي وصفًا مختصرًا للمشكلة.');
      event.currentTarget.querySelector('textarea')?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      const { error: failure } = await supabase.from('result_problem_reports').insert({
        id: requestId.current,
        category,
        target_employee_id: category === 'verify_employee' ? employee : null,
        description: description.trim(),
        results_period: `${resultsDate.getFullYear()}-${String(resultsDate.getMonth() + 1).padStart(2, '0')}-01`,
      }).abortSignal(AbortSignal.timeout(20000));
      // The same request ID is retained after an uncertain network response.
      if (failure && failure.code !== '23505') throw failure;
      setSent(true);
      setDescription('');
      setEmployee('');
    } catch {
      setError('تعذر تأكيد إرسال التقرير. تحققي من الاتصال ثم أعيدي المحاولة؛ لن يتكرر التقرير.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <>
    <button type="button" className="result-report-trigger" onClick={() => {
      if (!requestId.current || sent) {
        requestId.current = crypto.randomUUID();
        setCategory(''); setEmployee(''); setDescription(''); setSent(false); setError('');
      }
      dialog.current?.showModal();
    }}><Flag size={17} aria-hidden="true" />الإبلاغ عن مشكلة</button>
    <dialog ref={dialog} className="result-report-dialog" dir="rtl" aria-labelledby={`${id}-title`} aria-describedby={`${id}-privacy`}>
      <div className="result-report-heading">
        <h2 id={`${id}-title`}>الإبلاغ عن مشكلة</h2>
        <button type="button" className="result-report-close" aria-label="إغلاق نافذة الإبلاغ" autoFocus onClick={() => dialog.current?.close()}><X size={21} /></button>
      </div>
      <div className="result-report-privacy" id={`${id}-privacy`}>
        <ShieldCheck size={24} aria-hidden="true" />
        <p><strong>صوتك مسموع، وتقريرك يُعامل بسرية.</strong><br />يصل التقرير إلى مدير النظام فقط، ولا يظهر للموظفات أو للموظفة المذكورة فيه. يُراجع طلبك بعناية وإنصاف.</p>
      </div>
      {sent ? <div className="result-report-success" role="status">
        <CheckCircle2 size={38} aria-hidden="true" />
        <h3>تم إرسال تقريرك بسرية</h3>
        <p>شكرًا لحرصك على دقة النتائج. سيتم الرد خلال ساعات.</p>
        <button type="button" className="result-report-submit" onClick={() => dialog.current?.close()}>تم</button>
      </div> : <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend>نوع التقرير <span>(مطلوب)</span></legend>
          <div className="result-report-options">
            {categories.map(([value, label]) => <label key={value} className="result-report-option">
              <input type="radio" name="category" value={value} required checked={category === value} onChange={() => { setCategory(value); setError(''); requestId.current = crypto.randomUUID(); }} />
              <span>{label}</span>
            </label>)}
          </div>
          {category === 'verify_employee' && <div className="result-report-field">
            <label htmlFor={`${id}-employee`}>اسم الموظفة <span>(مطلوب)</span></label>
            <select id={`${id}-employee`} name="employee" required value={employee} onChange={event => { setEmployee(event.target.value); requestId.current = crypto.randomUUID(); }}>
              <option value="">اختاري الموظفة</option>
              {employees.map(user => <option key={user.id} value={user.id}>{user.name} — {user.branch}</option>)}
            </select>
            {!employees.length && <p>لا توجد موظفات متاحات للاختيار حاليًا.</p>}
          </div>}
          <div className="result-report-field">
            <label htmlFor={`${id}-description`}>وصف المشكلة <span>(مطلوب)</span></label>
            <textarea id={`${id}-description`} name="description" required maxLength={70} rows={3} value={description} aria-describedby={`${id}-count`} placeholder="اكتبي ما يساعدنا على مراجعة المشكلة" onChange={event => { setDescription(event.target.value); setError(''); requestId.current = crypto.randomUUID(); }} />
            <p id={`${id}-count`} className="result-report-count">{description.length.toLocaleString('ar-SA')} / ٧٠ حرفًا كحد أقصى</p>
          </div>
        </fieldset>
        {error && <p role="alert" className="result-report-error">{error}</p>}
        <button type="submit" className="result-report-submit" disabled={pending}>{pending ? 'جارٍ إرسال التقرير…' : 'إرسال التقرير'}</button>
        <p className="result-report-response">سيتم الرد خلال ساعات</p>
      </form>}
    </dialog>
  </>;
}
