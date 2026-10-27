import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { UserAccount } from '../lib/mockData';

type SignIns = Record<string, string | null>;
export function useEmployeeSignIns(open: boolean, viewer: UserAccount | null) {
  const viewerId = viewer?.role === 'admin' ? viewer.id : null;
  const [result, setResult] = useState<{ viewerId: string; data?: SignIns; error?: boolean } | null>(null);
  useEffect(() => {
    if (!open || !viewerId) return;
    let active = true, revision = 0;
    const controller = new AbortController();
    const load = async () => {
      const epoch = ++revision;
      setResult(null);
      try {
        const { data, error } = await supabase.rpc('get_employee_last_sign_ins').abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        if (error || !data || typeof data !== 'object' || Array.isArray(data) ||
          Object.values(data).some(value => value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))) throw new Error('invalid-sign-ins');
        if (active && epoch === revision) setResult({ viewerId, data: data as SignIns });
      } catch { if (active && epoch === revision) setResult({ viewerId, error: true }); }
    };
    void load();
    const reload = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', reload);
    return () => { active = false; controller.abort(); window.removeEventListener('focus', reload); };
  }, [open, viewerId]);
  return open && viewerId && result?.viewerId === viewerId ? result : null;
}
