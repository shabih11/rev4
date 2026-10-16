import React, { createContext, useContext } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { UserAccount } from '../lib/mockData';
import { useData } from './DataContext';
interface AuthContextType { user: UserAccount | null; ready: boolean; login: (email: string, pass: string) => Promise<boolean>; logout: () => Promise<void> }
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAccount, authReady, users } = useData();
  const user = currentAccount ? users.find(account => account.id === currentAccount.id) || currentAccount : null;
  const login = async (email: string, password: string) => {
    try { await signInWithEmailAndPassword(auth, email.trim(), password); return true; } catch { return false; }
  };
  return <AuthContext.Provider value={{ user, ready: authReady, login, logout: () => signOut(auth) }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
