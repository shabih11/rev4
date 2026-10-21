import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Brand } from '../components/Brand';
import { useData } from '../context/DataContext';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, user } = useAuth();
  const { syncError } = useData();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const data = new FormData(e.currentTarget as HTMLFormElement);
    const enteredPassword = String(data.get('password') || '');
    setBusy(true);
    const result = await login(String(data.get('username') || ''), enteredPassword);
    setBusy(false);
    if (result.success) {
      // Navigation waits for the authenticated server-side profile.
    } else {
      setError(result.error || 'تعذر تسجيل الدخول');
    }
  };

  return (
    <main className="login-page" dir="rtl">
      <aside className="login-identity" aria-label="أي آم سبيشل">
        <Brand light />
        <div className="login-story">
          <h2>كل تجربة<br />تصنع سمعتنا.</h2>
          <p>مساحة واحدة لمتابعة التقييمات، وتنظيم الشفتات، والاحتفاء بأثر الفريق.</p>
          <div className="login-orbits" aria-hidden="true"><span>✦</span><span>✦</span><span>✦</span></div>
        </div>
        <div className="login-benefits"><span>نتائج أوضح</span><span>فريق أقرب</span><span>إدارة أسهل</span></div>
      </aside>
      <section className="login-content" aria-labelledby="login-heading">
        <div className="login-mobile-brand"><Brand /></div>
        <div className="login-form-wrap">
          <h1 id="login-heading">مرحباً بعودتك</h1>
          <p className="login-intro">سجّلي الدخول لمتابعة يومك.</p>
          <form onSubmit={handleLogin} className="login-form" aria-busy={busy}>
            {(error || syncError) && <div id="login-error" className="login-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error || syncError}</p></div>}
            <div className="login-field">
              <label htmlFor="login-email">البريد الإلكتروني أو اسم المستخدم</label>
              <div className="login-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input id="login-email" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  value={email} onChange={e => setEmail(e.target.value)} className="login-input" placeholder="اسم المستخدم أو البريد الإلكتروني" required dir="ltr" enterKeyHint="next"
                  aria-describedby={error || syncError ? 'login-error' : undefined} />
              </div>
            </div>
            <div className="login-field">
              <label htmlFor="login-password">كلمة المرور</label>
              <div className="login-input-wrap">
                <Lock size={18} aria-hidden="true" />
                <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)} className="login-input" placeholder="••••••••" required dir="ltr" enterKeyHint="go"
                  aria-describedby={error || syncError ? 'login-error' : undefined} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy} className="primary-button">{busy ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}</button>
          </form>
          <p className="login-help">تحتاجين مساعدة؟ تواصلي مع مسؤول النظام.</p>
        </div>
        <p className="login-footer">أي آم سبيشل · إدارة السمعة الرقمية</p>
      </section>
    </main>
  );
};
