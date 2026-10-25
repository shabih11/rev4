import type { FeatureState } from './employeeFeatures';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { cachedRows, readNamespace } from './browserReadCache';
import type { CloudSession } from './cloudSync';
import type { UserAccount } from './mockData';
import type { ReviewSummary, TimelineEvent } from '../context/DataContext';
export interface DailyReadModel {
  disabledEmployeeIds?: string[]; features: FeatureState | null; generatedAt: string; directory: UserAccount[]; reviews: ReviewSummary[]; notes: TimelineEvent[]; hours: Record<string, number>;
}
export function useDailyReadModel(session: CloudSession) {
  const [day, setDay] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }));
  useEffect(() => {
    const timer = window.setInterval(() => setDay(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const namespace = readNamespace(session) + '|employee-deactivation-v1|' + day + '|', uid = session.account ? session.uid : null;
  const [value, setValue] = useState<{ namespace: string; revision: string; data: DailyReadModel } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true, revision = 0, subscribed = false, failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async (knownVersion?: string) => {
      const epoch = ++revision; clearTimeout(retry);
      try {
        let version = knownVersion;
        if (!version) {
          const { data, error } = await supabase.from('app_state').select('version').eq('id', 1).abortSignal(AbortSignal.timeout(15000)).single();
          if (error || !data) throw error || new Error('missing-state');
          version = String(data.version);
        }
        const rows = await cachedRows<DailyReadModel>(namespace + 'summary|' + version, async () => {
          const [{ data, error }, featureResult] = await Promise.all([
            supabase.rpc('get_read_model').abortSignal(AbortSignal.timeout(15000)),
            supabase.rpc('get_employee_features').abortSignal(AbortSignal.timeout(15000)),
          ]);
          if (error) throw error;
          if (!data || typeof data.generatedAt !== 'string' || !Array.isArray(data.directory) || !Array.isArray(data.reviews) || !Array.isArray(data.notes)) throw new Error('invalid-summary');
          return [{ ...data, features: featureResult.error ? null : featureResult.data } as DailyReadModel];
        }, true);
        if (active && epoch === revision) { failures = 0; setError(null); setValue({ namespace, revision: version, data: rows[0] }); }
      } catch (reason) {
        if (!active || epoch !== revision) return;
        setError('تعذر التحقق من البيانات؛ ستُستأنف المزامنة تلقائيًا.');
        const code = (reason as { code?: string })?.code;
        if (code !== '42501' && code !== 'PGRST301') retry = setTimeout(() => void load(), Math.min(300000, 5000 * 2 ** failures++));
      }
    };
    void load();
    const channel = supabase.channel(`summary:${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'id=eq.1' }, payload => void load(String(payload.new.version)))
      .subscribe(status => { if (status === 'SUBSCRIBED') { if (subscribed) void load(); subscribed = true; } });
    const reload = () => { void load(); };
    window.addEventListener('online', reload); window.addEventListener('rev4-cache-changed', reload);
    return () => { active = false; revision++; clearTimeout(retry); void supabase.removeChannel(channel); window.removeEventListener('online', reload); window.removeEventListener('rev4-cache-changed', reload); };
  }, [uid, namespace]);
  const current = uid && value?.namespace === namespace ? value : null;
  return { data: current?.data || null, ready: Boolean(current), error: uid ? error : null, revision: current?.revision || 'initial' };
}
