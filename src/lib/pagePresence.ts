const presenceInterval = 60000;

// Only the visible, focused page sends heartbeats. No account identifiers or
// client timestamps are sent; the server obtains both from the active session.
export function startPagePresence(
  record: (signal: AbortSignal) => Promise<void>,
  page: Pick<Document, 'visibilityState' | 'hasFocus' | 'addEventListener' | 'removeEventListener'> = document,
  browser: Pick<Window, 'performance' | 'setInterval' | 'clearInterval' | 'addEventListener' | 'removeEventListener'> = window,
) {
  let stopped = false, inFlight = false, lastAttempt = -Infinity;
  const controller = new AbortController();
  const ping = async () => {
    if (stopped || inFlight || page.visibilityState !== 'visible' || !page.hasFocus()) return;
    const now = browser.performance.now();
    if (now - lastAttempt < presenceInterval) return;
    lastAttempt = now; inFlight = true;
    try { await record(controller.signal); }
    catch { /* Optional presence retries on the next visible heartbeat. */ }
    finally { inFlight = false; }
  };
  const refresh = () => { void ping(); };
  refresh();
  const timer = browser.setInterval(refresh, presenceInterval);
  browser.addEventListener('focus', refresh);
  browser.addEventListener('online', refresh);
  page.addEventListener('visibilitychange', refresh);
  return () => {
    stopped = true; controller.abort(); browser.clearInterval(timer);
    browser.removeEventListener('focus', refresh);
    browser.removeEventListener('online', refresh);
    page.removeEventListener('visibilitychange', refresh);
  };
}
