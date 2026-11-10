import { simulationSnapshot, subscribeSimulation } from '../lib/simulationState';
import { useEffect, useSyncExternalStore } from 'react';
import { beginUsage, usagePage, type UsagePage } from '../lib/usageAnalytics';
export function useUsageAnalytics(id: string | undefined) {
  const simulation = useSyncExternalStore(subscribeSimulation, simulationSnapshot);
  useEffect(() => { if (id && !simulation) return beginUsage(id); }, [id, simulation]);
  useEffect(() => {
    const route = () => usagePage(location.hash.startsWith('#/dashboard') ? 'dashboard' : 'leaderboard');
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);
}
export function useUsagePage(page: UsagePage) { useEffect(() => { usagePage(page); }, [page]); }
