import type { SupabaseClient } from '@supabase/supabase-js';
import { recordFilters, type RecordScope } from './cloudReadPlan';
import { stableJSON } from './browserReadCache';
export function publicProfile<T extends Record<string, any>>(record: T) {
  const { email: _email, password: _password, mustChangePassword: _flag, mustSetUsername: _setup, username: _username, ...profile } = record;
  return profile;
}
export function scopeArguments(source: string, scope: RecordScope | null, account: { role: string; id: string; branch: string }) {
  const filters = recordFilters(source, scope, account);
  if (filters === null) return null;
  return { source, all_rows: filters.length === 0,
    requested_branches: filters.filter(f => f.field === 'branch').flatMap(f => Array.isArray(f.value) ? f.value : [f.value]),
    requested_employees: filters.filter(f => f.field !== 'branch').flatMap(f => Array.isArray(f.value) ? f.value : [f.value]) };
}
export function rowChanges<T extends { id: string }>(before: T[], after: T[]) {
  if (new Set(after.map(row => row.id)).size !== after.length) throw new Error('duplicate-record');
  const old = new Map(before.map(row => [row.id, row])), next = new Map(after.map(row => [row.id, row]));
  return [...new Set([...old.keys(), ...next.keys()])].filter(id => stableJSON(old.get(id)) !== stableJSON(next.get(id)))
    .map(id => ({ id, before: old.get(id) || null, after: next.get(id) || null }));
}
export async function loadRows<T>(client: SupabaseClient, source: string, args: NonNullable<ReturnType<typeof scopeArguments>>) {
  const result: T[] = [];
  for (let start = 0; ; start += 500) {
    const query = source === 'users' ? client.rpc('get_accounts') : client.rpc('read_rows', args);
    const { data, error } = await query.range(start, start + 499).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('invalid-record-response');
    result.push(...data as T[]);
    if (data.length < 500) return result;
  }
}
