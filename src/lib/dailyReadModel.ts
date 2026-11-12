import type { AvatarPrivilegeState } from './avatarPrivileges';
import type { FeatureState } from './employeeFeatures';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { cachedRows, readNamespace } from './browserReadCache';
import type { CloudSession } from './cloudSync';
import type { UserAccount } from './mockData';
import type { BranchBadgeReward, ReviewSummary, TimelineEvent } from '../context/DataContext';
export interface DailyReadModel {
  avatarPrivileges?: AvatarPrivilegeState;
  branchBadgeRewards?: BranchBadgeReward[];
  disabledEmployeeIds?: string[]; features: FeatureState | null; generatedAt: string; directory: UserAccount[]; reviews: ReviewSummary[]; notes: TimelineEvent[]; hours: Record<string, number>;
}
export function useDailyReadModel(session: CloudSession) {
  const [day, setDay] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }));
  useEffect(() => {
    const timer = window.setInterval(() => setDay(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const namespace = readNamespace(session) + '|employee-deactivation-v1|features-retry-v2|' + day + '|', uid = session.account ? session.uid : null;
  const [value, setValue] = useState<{ namespace: string; revision: string; data: DailyReadModel } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true, revision = 0, failures = 0, pendingLoads = 0;
    let loadedVersion: string | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async (knownVersion?: string, force = false) => {
      if (!active) return;
      const epoch = ++revision; clearTimeout(retry);
      pendingLoads++;
      try {
        let version = knownVersion;
        if (!version) {
          const { data, error } = await supabase.from('app_state').select('version').eq('id', 1).abortSignal(AbortSignal.timeout(15000)).single();
          if (error || !data) throw error || new Error('missing-state');
          version = String(data.version);
        }
        if (!force && version === loadedVersion) {
          if (active && epoch === revision) { failures = 0; setError(null); }
          return;
        }
        const rows = await cachedRows<DailyReadModel>(namespace + 'summary|' + version, async () => {
          const [{ data, error }, featureResult] = await Promise.all([
            supabase.rpc('get_read_model').abortSignal(AbortSignal.timeout(15000)),
            supabase.rpc('get_employee_features').abortSignal(AbortSignal.timeout(15000)),
          ]);
          if (error) throw error;
          if (featureResult.error) throw featureResult.error;
          if (!data || typeof data.generatedAt !== 'string' || !Array.isArray(data.directory) || !Array.isArray(data.reviews) || !Array.isArray(data.notes)) throw new Error('invalid-summary');
          return [{ ...data, features: featureResult.data } as DailyReadModel];
        }, true);
        if (active && epoch === revision) { loadedVersion = version; failures = 0; setError(null); setValue({ namespace, revision: version, data: rows[0] }); }
      } catch (reason) {
        if (!active || epoch !== revision) return;
        setError('تعذر التحقق من البيانات؛ ستُستأنف المزامنة تلقائيًا.');
        const code = (reason as { code?: string })?.code;
        if (code !== '42501' && code !== 'PGRST301') retry = setTimeout(() => void load(), Math.min(300000, 5000 * 2 ** failures++));
      } finally {
        pendingLoads--;
      }
    };
    void load();
    const channel = supabase.channel(`summary:${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'id=eq.1' }, payload => void load(String(payload.new.version)))
      .subscribe(status => { if (status === 'SUBSCRIBED') void load(); });
    const reload = () => { void load(undefined, true); };
    // Realtime is the fast path; a lightweight version check covers missed events.
    const checkVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !pendingLoads && !failures) void load();
    };
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    const poll = window.setInterval(checkVisible, 15000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', reload); window.addEventListener('rev4-cache-changed', reload);
    return () => { active = false; revision++; clearTimeout(retry); window.clearInterval(poll); document.removeEventListener('visibilitychange', visible); void supabase.removeChannel(channel); window.removeEventListener('online', reload); window.removeEventListener('rev4-cache-changed', reload); };
  }, [uid, namespace]);
  const current = uid && value?.namespace === namespace ? value : null;
  return { data: current?.data || null, ready: Boolean(current), error: uid ? error : null, revision: current?.revision || 'initial' };
}
