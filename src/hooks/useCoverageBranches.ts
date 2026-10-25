import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cachedRows, readNamespace } from '../lib/browserReadCache';
import type { CloudSession } from '../lib/cloudSync';
import type { UserAccount } from '../lib/mockData';
import { isCoverageEmployee, latestCoverageBranches, type ShiftBranchRecord } from '../lib/employeeBranches';

export function useCoverageBranches(users: UserAccount[], session: CloudSession, revision: string, enabled: boolean) {
  const idsKey = JSON.stringify(users.filter(user => user.role === 'employee' && isCoverageEmployee(user)).map(user => user.id).sort());
  const namespace = readNamespace(session);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  const [result, setResult] = useState<{ key: string; identity: string; branches: Record<string, string>; error: string | null }>();
  const identity = `${namespace}|${idsKey}`;
  const key = `${namespace}|coverage-branches|${revision}|${minute}|${idsKey}`;
  useEffect(() => {
    if (!enabled || idsKey === '[]') return;
    const timer = window.setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 60000);
    return () => window.clearInterval(timer);
  }, [enabled, idsKey]);
  useEffect(() => {
    if (!enabled || !session.account) return;
    let active = true;
    const ids: string[] = JSON.parse(idsKey);
    if (!ids.length) { setResult({ key, identity, branches: {}, error: null }); return; }
    const now = Date.now();
    void cachedRows<ShiftBranchRecord>(key, async () => {
      const rows: ShiftBranchRecord[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await supabase.from('timeline_events').select('id,branch,occurred_at,employee_ids')
          .eq('kind', 'shift').overlaps('employee_ids', ids).lte('occurred_at', new Date(now).toISOString())
          .order('occurred_at', { ascending: false }).order('id', { ascending: false }).range(start, start + 499).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        rows.push(...(data || []));
        if ((data || []).length < 500 || Object.keys(latestCoverageBranches(rows, ids, now)).length === ids.length) return rows;
      }
    }, true).then(rows => { if (active) setResult({ key, identity, branches: latestCoverageBranches(rows, ids, now), error: null }); })
      .catch(() => { if (active) setResult(previous => ({ key, identity, branches: previous?.identity === identity ? previous.branches : {}, error: 'تعذر التحقق من آخر فرع لموظفات التغطية. ستُعاد المحاولة تلقائياً.' })); });
    // The cache shares in-flight reads; cancelling here would break another subscriber (including StrictMode).
    return () => { active = false; };
  }, [key, identity, idsKey, enabled, session.account]);
  return { branches: enabled && result?.identity === identity ? result.branches : {}, ready: enabled && result?.key === key && !result.error, error: result?.key === key ? result.error : null };
}
