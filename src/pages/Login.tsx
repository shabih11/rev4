import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail } from 'lucide-react';
import { useData } from '../context/DataContext';
import { toEnglishNumerals } from '../lib/formatDate';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, user } = useAuth();
  const { syncError } = useData();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const enteredPassword = toEnglishNumerals(String(data.get('password') || '')).trim();
    setBusy(true);
    const result = await login(String(data.get('email') || ''), enteredPassword);
    setBusy(false);
    if (result.success) {
      // Navigation waits for the authenticated server-side profile.
    } else {
      setError(result.error || 'تعذر تسجيل الدخول');
    }
  };

  return (
    <div className="w-full h-screen bg-gray-50 flex items-center justify-center p-4 font-alexandria" dir="rtl">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute top-0 left-0 w-full h-32 bg-blue-500 rounded-b-[50%] scale-150 -translate-y-10"></div>
        
        <div className="relative z-10 text-center mt-4 mb-10 text-white">
          <h1 className="text-4xl font-extrabold mb-2">أي آم سبيشل</h1>
          <p className="text-blue-100">إدارة السمعة الرقمية</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {(error || syncError) && (
            <div className="bg-red-50 text-red-500 p-4 rounded-xl text-sm font-bold text-center">
              {error || syncError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="login-email" className="text-gray-700 font-bold text-sm block">البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-12 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
                placeholder="email@iamspecial.sa"
                required
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="text-gray-700 font-bold text-sm block">كلمة المرور</label>
            <div className="relative">
              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                id="login-password" name="password" type="password" autoComplete="current-password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-12 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
                placeholder="••••••••"
                required
                dir="ltr"
              />
            </div>
          </div>

          <button 
            type="submit" disabled={busy}
            className="w-full bg-blue-500 text-white font-bold text-xl py-4 rounded-xl shadow-lg hover:bg-blue-600 hover:scale-[1.02] transition-all"
          >
            {busy ? 'جارٍ تسجيل الدخول…' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
};
