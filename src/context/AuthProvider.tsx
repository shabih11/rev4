import type React from 'react';
import { AuthContext } from './AuthContext';
import { requireAccountSetup } from '../lib/accountSetupConfig';
import { supabase } from '../lib/supabase';
import { normalizeLoginEmail, normalizeLoginPassword, loginErrorMessage } from '../lib/loginInput';
import { getMyAccount, accountAccessMessages } from '../lib/accountAccess';
import { useData } from './DataContext';
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAccount, authReady, users } = useData();
  const directoryEntry = users.find(account => account.id === currentAccount?.id);
  const user = currentAccount ? { ...currentAccount, ...directoryEntry, role: currentAccount.role, branch: currentAccount.branch, email: currentAccount.email, username: currentAccount.username, mustSetUsername: currentAccount.mustSetUsername, mustChangePassword: currentAccount.mustChangePassword } : null;
  const login = async (email: string, password: string) => {
    try {
      const identifier = normalizeLoginEmail(email);
      let accessToken = '';
      if (identifier.includes('@')) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password: normalizeLoginPassword(password) });
        if (error) throw error;
        accessToken = data.session?.access_token || '';
      } else {
        const { data, error } = await supabase.functions.invoke('account-login', { body: { username: identifier, password: normalizeLoginPassword(password) } });
        if (error || typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') {
          let code = 'invalid_credentials';
          if (error?.context instanceof Response) { try { code = (await error.context.json()).error || code; } catch { /* Generic authentication failure. */ } }
          throw { code };
        }
        const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        if (sessionError) throw sessionError;
        accessToken = data.access_token;
      }
      const { error: accessError } = await getMyAccount(supabase, accessToken);
      if (accessError) {
        if (accessError === 'denied') await supabase.auth.signOut({ scope: 'local' });
        return { success: false, error: accountAccessMessages[accessError] };
      }
      return { success: true };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      return { success: false, error: loginErrorMessage(code) };
    }
  };
  const completeAccountSetup = async (username: string, password?: string) => {
    if (!user || !requireAccountSetup) return { success: false, error: 'إعداد بيانات الدخول غير متاح في هذه النسخة' };
    try {
      const { data, error } = await supabase.functions.invoke('account-setup', { body: { username, ...(password !== undefined ? { password: normalizeLoginPassword(password) } : {}) } });
      if (error) {
        let code = '';
        if (error.context instanceof Response) { try { code = (await error.context.json()).error || ''; } catch { /* No private error details. */ } }
        if (code === 'reauthentication_required') { await supabase.auth.signOut({ scope: 'local' }); return { success: false, error: 'حُفظت بيانات الدخول. سجّلي الدخول مجددًا باسم المستخدم وكلمة المرور الجديدة.' }; }
        return { success: false, error: code === 'username_taken' ? 'اسم المستخدم مستخدم؛ اختاري اسمًا آخر.' : code === 'default_password' ? 'اختاري كلمة مرور تختلف عن الافتراضية.' : code === 'invalid_password' ? 'كلمة المرور الجديدة من ٨ إلى ١٢٨ خانة.' : code === 'password_update_failed' ? 'حُفظ اسم المستخدم وتعذر تحديث كلمة المرور. أعيدي المحاولة.' : 'تعذر حفظ بيانات الدخول؛ تحققي من الاسم والاتصال ثم أعيدي المحاولة.' };
      }
      if (!data?.success) return { success: false, error: 'تعذر التحقق من حفظ بيانات الدخول' };
      if (data.access_token && data.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        if (sessionError) { await supabase.auth.signOut({ scope: 'local' }); return { success: false, error: 'سجّلي الدخول مجددًا ببياناتك الجديدة.' }; }
      }
      window.dispatchEvent(new Event('rev4-account-changed'));
      return { success: true };
    } catch { return { success: false, error: 'تعذر حفظ بيانات الدخول؛ أعيدي المحاولة.' }; }
  };
  const updateName = async (name: string) => {
    if (!user || !['admin', 'employee'].includes(user.role)) return { success: false, error: 'تعديل الاسم غير متاح لهذا الحساب' };
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
  return <AuthContext.Provider value={{ user, ready: authReady, login, logout, changePassword, updateName, completeAccountSetup }}>{children}</AuthContext.Provider>;
};
