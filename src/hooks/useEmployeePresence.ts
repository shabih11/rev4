import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { UserAccount } from '../lib/mockData';

type Presence = Record<string, string | null>;
export function useEmployeePresence(open: boolean, viewer: UserAccount | null) {
  const viewerId = viewer?.role === 'admin' ? viewer.id : null;
  const [result, setResult] = useState<{ viewerId: string; data?: Presence; error?: boolean } | null>(null);
  useEffect(() => {
    setResult(null);
    if (!open || !viewerId) return;
    let active = true, loading = false, revision = 0;
    const controller = new AbortController();
    const load = async () => {
      if (document.visibilityState !== 'visible' || loading) return;
      loading = true;
      const epoch = ++revision;
      try {
        const { data, error } = await supabase.rpc('get_employee_last_presence').abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        if (error || !data || typeof data !== 'object' || Array.isArray(data) ||
          Object.values(data).some(value => value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))) throw new Error('invalid-presence');
        if (active && epoch === revision) setResult({ viewerId, data: data as Presence });
      } catch { if (active && epoch === revision) setResult({ viewerId, error: true }); }
      finally { loading = false; }
    };
    void load();
    const reload = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(reload, 60000);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [open, viewerId]);
  return open && viewerId && result?.viewerId === viewerId ? result : null;
}
