import { simulationSnapshot } from '../lib/simulationState';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { startPagePresence } from '../lib/pagePresence';
import type { UserAccount } from '../lib/mockData';

export function usePagePresence(account: UserAccount | null) {
  const employeeId = account?.role === 'employee' || account?.role === 'manager' ? account.id : null;
  useEffect(() => {
    if (!employeeId || simulationSnapshot()) return;
    return startPagePresence(async signal => {
      const { error } = await supabase.rpc('record_employee_page_presence')
        .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15000)]));
      if (error) throw error;
    });
  }, [employeeId]);
}
