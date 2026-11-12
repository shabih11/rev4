import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { riyadhDay } from '../lib/employeeFeatures';

export function useMonthlyAvatars(enabled: boolean, period: Date) {
  const month = `${riyadhDay(period).slice(0, 7)}-01`;
  const [state, setState] = useState<{ month: string; paths: Record<string, string | null>; error: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void supabase.rpc('get_monthly_avatars', { requested_month: month }).then(({ data, error }) => {
      if (active) setState({ month, paths: error ? {} : data || {}, error: Boolean(error) });
    });
    return () => { active = false; };
  }, [enabled, month]);
  return { ready: enabled && state?.month === month && !state.error, paths: state?.month === month ? state.paths : {}, error: enabled && state?.month === month && state.error };
}
