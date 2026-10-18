import React, { createContext, useContext } from 'react';
import { signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { APP_PATH, auth, db } from '../lib/firebase';
import { normalizeLoginEmail, normalizeLoginPassword, loginErrorMessage } from '../lib/loginInput';
import type { UserAccount } from '../lib/mockData';
import { cloudId } from '../lib/cloudSync';
import { useData } from './DataContext';

interface AuthContextType {
  user: UserAccount | null;
  ready: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (newPass: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAccount, authReady, users } = useData();
  const user = currentAccount ? users.find(account => account.id === currentAccount.id) || currentAccount : null;

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, normalizeLoginEmail(email), normalizeLoginPassword(password));
      return { success: true };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      return { success: false, error: loginErrorMessage(code) };
    }
  };

  const changePassword = async (newPass: string): Promise<{ success: boolean; error?: string }> => {
    let passwordUpdated = false;
    try {
      if (!auth.currentUser || !user) return { success: false, error: 'انتهت جلسة الدخول. سجّلي الدخول مجددًا ثم حاولي مرة أخرى.' };
      await updatePassword(auth.currentUser, newPass);
      passwordUpdated = true;
      await updateDoc(doc(db, APP_PATH, 'users', await cloudId(user.id)), { mustChangePassword: false });
      return { success: true };
    } catch (error: any) {
      console.error('Password update error:', error);
      if (passwordUpdated) return { success: false, error: 'تغيّرت كلمة المرور، لكن تعذّر حفظ اكتمال الخطوة. سجّلي الخروج ثم ادخلي بكلمة المرور الجديدة وأعيدي المحاولة.' };
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'auth/requires-recent-login') {
        return { success: false, error: 'يتطلب تغيير كلمة المرور إعادة تسجيل الدخول أولاً لدواعي الأمان' };
      }
      return { success: false, error: error?.message || 'تعذر تغيير كلمة المرور' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, ready: authReady, login, logout: () => signOut(auth), changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
