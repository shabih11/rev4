import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SeaCompletion } from '../lib/seaMission';

export function useSeaCompletions(accountId?: string) {
  const [completions, setCompletions] = useState<SeaCompletion[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setReady(false);
    setCompletions([]);
    const refresh = async () => {
      if (!accountId) return;
      try {
        const result = await supabase.from('sea_mission_completions').select('branch,day,approved_at');
        if (!active) return;
        if (result.error) throw result.error;
        setCompletions(result.data ?? []);
        setReady(true);
        setError('');
      } catch {
        if (active) { setReady(false); setError('تعذر تحميل اعتمادات مهمة البحر. تحققي من الاتصال وتحديث قاعدة البيانات.'); }
      }
    };
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(visible, 30000);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [accountId]);
  const approve = useCallback(async (branch: string, day: number) => {
    const { data, error } = await supabase.from('sea_mission_completions').insert({ branch, day }).select('branch,day,approved_at').single();
    if (error) throw error;
    setCompletions(current => [...current.filter(item => item.branch !== branch || item.day !== day), data]);
  }, []);
  return { completions, ready, error, approve };
}
