import { createClient } from '@supabase/supabase-js';
// Publishable configuration is public by design. Authorization lives in PostgreSQL RLS.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://zcnfzrkegodvrtzimlnn.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_iM1m6f3ZqrVJDGcurcndNw_MfBfMJOJ";
export const supabase = createClient(url, key, {
  auth: { storageKey: 'rev4-supabase-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(15000) }) },
});
