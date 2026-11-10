import type { UserAccount } from './mockData';
export interface Simulation { id: string; actor: UserAccount; target: UserAccount }
let current: Simulation | null = null;
const listeners = new Set<() => void>();
export const simulationSnapshot = () => current;
export const subscribeSimulation = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
// Memory only: never replace or persist the administrator's authentication tokens.
export function setSimulation(value: Simulation | null) {
  current = value;
  for (const listener of listeners) listener();
}
