import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserAccount } from './mockData';
import type { CloudSession } from './cloudSync';
import type { DataContextType } from '../context/DataContext';
import { isCoverageEmployee } from './employeeBranches';

export function createEmployeeActions({ users, setUsers, session, summaryReady, branchSettings, client: supabase, invalidate, notify }: {
  users: UserAccount[];
  setUsers: Dispatch<SetStateAction<UserAccount[]>>;
  session: CloudSession;
  summaryReady: boolean;
  branchSettings: DataContextType['branchSettings'];
  client: Pick<SupabaseClient, 'rpc'>;
  invalidate: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const updateUser = (id: string, updates: Partial<UserAccount>) => {
    let newUsers: UserAccount[] = [];
    setUsers(prev => {
      newUsers = prev.map(u => u.id === id ? { ...u, ...updates } : u);
      return newUsers;
    });

  };

  const addUser = (newUser: Omit<UserAccount, 'points' | 'reviewsCount'>) => {
    const userWithDefaults: UserAccount = { ...newUser, points: 0, reviewsCount: 0, mustChangePassword: true };
    const newUsers = [...users, userWithDefaults];
    setUsers(newUsers);
  };

  const setEmployeeDisabled = async (id: string, disabled: boolean) => {
    if (session.account?.role !== 'admin' || !summaryReady || !users.some(user => user.id === id && user.role === 'employee')) return false;
    try {
      const { error } = await supabase.rpc('set_employee_disabled', { employee_id: id, disabled });
      if (error) return false;
      await invalidate();
      return true;
    } catch { return false; }
  };

  const transferEmployee = async (id: string, branch: string) => {
    const employee = users.find(item => item.id === id && item.role === 'employee');
    if (session.account?.role !== 'admin' || !summaryReady || !employee || (branch !== 'موظفة خارجية' && !branchSettings[branch])) return false;
    const { error } = await supabase.rpc('transfer_employee', {
      employee_id: id, requested_branch: branch, expected_branch: employee.branch, expected_mobile: isCoverageEmployee(employee),
    });
    if (error) return false;
    await invalidate();
    return true;
  };

  const mergeEmployees = async (primaryId: string, duplicateId: string, newName?: string, newBranch?: string, coverage?: boolean) => {
    const primary = users.find(u => u.id === primaryId);
    if (!primary || !(session.account?.role === 'admin' && summaryReady)) return false;
    const { error } = await supabase.rpc('merge_employees_with_coverage', { primary_id: primaryId, duplicate_id: duplicateId,
      requested_name: newName?.trim() || primary.name, requested_branch: newBranch || primary.branch, requested_coverage: coverage ?? isCoverageEmployee(primary) });
    if (error) { notify('تعذر دمج الموظفات؛ لم تُحفظ أي تغييرات جزئية'); return false; }
    await invalidate();
    return true;
  };
  return { updateUser, addUser, setEmployeeDisabled, transferEmployee, mergeEmployees };
}
