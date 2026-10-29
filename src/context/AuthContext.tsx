import React, { createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeLoginEmail, normalizeLoginPassword, loginErrorMessage } from '../lib/loginInput';
import type { UserAccount } from '../lib/mockData';
import { useData } from './DataContext';
interface AuthContextType {
  user: UserAccount | null; ready: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (newPass: string) => Promise<{ success: boolean; error?: string }>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAccount, authReady, users } = useData();
  const directoryEntry = users.find(account => account.id === currentAccount?.id);
  const user = currentAccount ? { ...currentAccount, ...directoryEntry, role: currentAccount.role, branch: currentAccount.branch, email: currentAccount.email, mustChangePassword: false } : null;
  const login = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizeLoginEmail(email), password: normalizeLoginPassword(password) });
      if (error) throw error;
      const { data: account, error: accessError } = await supabase.rpc('get_my_account');
      if (accessError || !account) {
        await supabase.auth.signOut({ scope: 'local' });
        return { success: false, error: 'الحساب غير مخوّل للدخول. تواصلي مع الإدارة.' };
      }
      return { success: true };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      return { success: false, error: loginErrorMessage(code) };
    }
  };
  const updateName = async (name: string) => {
    if (!user || user.role === 'manager') return { success: false, error: 'تعديل اسم حساب إدارة الفرع متاح للإدارة العامة فقط' };
    const { error } = await supabase.rpc('rename_me', { new_name: name, previous_name: user.name });
    return error ? { success: false, error: 'لم يُحفظ الاسم. تحققي من الاتصال أو حدّثي البيانات بعد تعارض التعديل.' } : { success: true };
  };
  const logout = async () => { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; };
  const changePassword = async (newPass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user || user.role !== 'admin') return { success: false, error: 'تغيير كلمة المرور متاح للإدارة العامة فقط' };
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !data.user) return { success: false, error: 'سجلي الدخول مجددًا لتغيير كلمة المرور' };
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      return { success: true };
    } catch { return { success: false, error: 'تعذر تغيير كلمة المرور. تحققي من متطلبات كلمة المرور وصلاحية الجلسة.' }; }
  };
  return <AuthContext.Provider value={{ user, ready: authReady, login, logout, changePassword, updateName }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
