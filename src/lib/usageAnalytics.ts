import { supabase } from './supabase';
export const usagePages = ['leaderboard', 'dashboard', 'avatar', 'profile', 'employees', 'shifts', 'branches', 'notes', 'stats', 'features', 'avatars', 'analytics'] as const;
export type UsagePage = typeof usagePages[number];
export type UsageEvent = { id: string; session: string; kind: 'session_start' | 'page_view' | 'active' | 'click' | 'session_end'; page: UsagePage; seconds: number; action: string };
export function startUsageTracker(send: (events: UsageEvent[]) => Promise<boolean>, initial: UsagePage) {
  let page = initial, session = crypto.randomUUID(), lastInput = Date.now(), lastTick = Date.now(), lastSeen = Date.now(), stopped = false, sending = false;
  const queue: UsageEvent[] = [];
  const add = (kind: UsageEvent['kind'], seconds = 0, action = '') => {
    if (queue.length < 200) queue.push({ id: crypto.randomUUID(), session, kind, page, seconds, action });
  };
  const flush = async () => {
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.slice(0, 50);
    try { if (await send(batch)) queue.splice(0, batch.length); } catch { /* Bounded memory retry; never persist user data. */ }
    finally { sending = false; }
  };
  const tick = () => {
    const now = Date.now();
    if (document.visibilityState === 'visible' && document.hasFocus() && now - lastInput <= 60000 && now - lastTick <= 20000) {
      const seconds = Math.min(15, Math.floor((now - lastTick) / 1000));
      if (seconds > 0) add('active', seconds);
    }
    lastTick = now;
  };
  const input = () => {
    const now = Date.now();
    if (now - lastSeen > 30 * 60000) { session = crypto.randomUUID(); add('session_start'); add('page_view'); }
    lastSeen = now; lastInput = now;
  };
  const click = (event: Event) => {
    input();
    const element = event.target instanceof Element ? event.target.closest('[data-usage-action]') : null;
    const action = element?.getAttribute('data-usage-action');
    if (action && ['navigation', 'open_details', 'submit_request', 'purchase', 'equip', 'logout'].includes(action)) add('click', 0, action);
  };
  const visibility = () => { tick(); if (document.visibilityState === 'hidden') void flush(); else lastTick = Date.now(); };
  const events = ['pointerdown', 'keydown', 'scroll'] as const;
  events.forEach(name => window.addEventListener(name, input, { passive: true }));
  document.addEventListener('click', click); document.addEventListener('visibilitychange', visibility);
  add('session_start'); add('page_view');
  const timer = window.setInterval(() => { tick(); void flush(); }, 15000);
  void flush();
  return {
    page(next: UsagePage) { if (!stopped && page !== next) { tick(); page = next; add('page_view'); } },
    stop() { stopped = true; tick(); add('session_end'); clearInterval(timer); events.forEach(name => window.removeEventListener(name, input)); document.removeEventListener('click', click); document.removeEventListener('visibilitychange', visibility); void flush(); },
  };
}
let tracker: ReturnType<typeof startUsageTracker> | null = null;
export function usagePage(page: UsagePage) { tracker?.page(page); }
export function beginUsage(profile: string) {
  void supabase.rpc('record_usage_login').then(() => {}, () => {});
  tracker = startUsageTracker(async batch => { const { error } = await supabase.rpc('record_usage_batch', { batch, expected_profile: profile }); return !error; }, location.hash.startsWith('#/dashboard') ? 'dashboard' : 'leaderboard');
  const current = tracker;
  return () => { current.stop(); if (tracker === current) tracker = null; };
}
