import { useId, useState } from 'react';
import { KeyRound, LogOut, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { normalizeUsername, validUsername } from '../lib/accountSetup';
export function AccountSetup() {
  const { user, completeAccountSetup, logout } = useAuth();
  const heading = useId(), usernameId = useId(), passwordId = useId(), confirmationId = useId();
  const [username, setUsername] = useState(user?.mustSetUsername === false ? user.username || '' : '');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;
  const statusReady = typeof user.mustSetUsername === 'boolean' && typeof user.mustChangePassword === 'boolean';
  const mustChangePassword = user.mustChangePassword !== false;
  return <main dir="rtl" className="min-h-[100svh] bg-slate-50 p-4 sm:p-8 flex items-center justify-center">
    <section aria-labelledby={heading} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
      <KeyRound aria-hidden="true" className="mb-4 text-blue-700" size={30} />
      <h1 id={heading} className="text-2xl font-extrabold text-slate-900">إعداد بيانات الدخول</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">مرحبًا {user.name}. اختاري اسم مستخدم خاصًا بك؛ يمكنك الاستمرار في الدخول بالبريد أيضًا.{mustChangePassword ? ' ولأن كلمة مرورك افتراضية، يجب تعيين كلمة مرور جديدة قبل المتابعة.' : ''}</p>
      {!statusReady && <p role="alert" className="mt-4 text-sm text-red-700">تعذر التحقق من متطلبات الحساب. أعيدي تحميل الصفحة أو تواصلي مع الإدارة.</p>}
      {saved ? <p role="status" className="mt-6 text-emerald-800">تم حفظ بيانات الدخول. جارٍ فتح حسابك…</p> : <form className="mt-6 space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (!statusReady || busy) return;
        setError('');
        const normalized = normalizeUsername(username);
        if (!validUsername(normalized)) { setError('اسم المستخدم من ٣ إلى ٣٢ خانة: حروف إنجليزية وأرقام ونقطة أو شرطة فقط.'); return; }
        if (mustChangePassword && (password.trim().length < 8 || password.length > 128)) { setError('كلمة المرور الجديدة من ٨ إلى ١٢٨ خانة.'); return; }
        if (mustChangePassword && password !== confirmation) { setError('كلمتا المرور غير متطابقتين.'); return; }
        setBusy(true);
        const result = await completeAccountSetup(normalized, mustChangePassword ? password : undefined);
        setBusy(false);
        if (!result.success) { setError(result.error || 'تعذر حفظ البيانات'); return; }
        setPassword(''); setConfirmation(''); setSaved(true);
      }}>
        <div><label htmlFor={usernameId} className="block text-sm font-bold">اسم المستخدم</label>
          <input id={usernameId} value={username} onChange={event => setUsername(event.target.value)} required minLength={3} maxLength={32} readOnly={user.mustSetUsername === false} disabled={busy} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" aria-describedby={`${usernameId}-help`} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-slate-900 read-only:bg-slate-100" />
          <p id={`${usernameId}-help`} className="mt-1 text-xs text-slate-500">حروف إنجليزية وأرقام، ويمكن استخدام . أو _ أو -</p>
        </div>
        {mustChangePassword && <>
          <div><label htmlFor={passwordId} className="block text-sm font-bold">كلمة المرور الجديدة</label>
            <div className="relative mt-2"><input id={passwordId} type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} dir="ltr" className="w-full rounded-xl border border-slate-300 p-3 pl-12" />
              <button type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 left-0 min-w-11 flex items-center justify-center text-slate-600">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <div><label htmlFor={confirmationId} className="block text-sm font-bold">تأكيد كلمة المرور الجديدة</label><input id={confirmationId} type={showPassword ? 'text' : 'password'} value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} dir="ltr" className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></div>
        </>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button disabled={busy || !statusReady} className="min-h-12 w-full rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'}</button>
      </form>}
      <button type="button" disabled={busy} onClick={async () => { try { await logout(); } catch { setError('تعذر تسجيل الخروج. أعيدي المحاولة.'); } }} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600"><LogOut size={17} aria-hidden="true" />خروج</button>
    </section>
  </main>;
}
