import { BRANCH_HOURS } from './branchHours';
import { timeMinutes } from './formatDate';
import { seaBranchName, type SeaBranch } from './seaMission';

export type SeaLight = 'sunny' | 'soft' | 'night';
export type SeaScene = 'sleep' | 'coffee' | 'adventure' | 'celebrate' | 'distress';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const RIYADH = 3 * HOUR;

// These are visual day phases, not a weather forecast or astronomical sunrise times.
export function seaLight(now: number): SeaLight {
  const local = new Date(now + RIYADH);
  const hour = local.getUTCHours();
  return hour >= 6 && hour < 15 ? 'sunny' : hour >= 15 && hour < 19 ? 'soft' : 'night';
}

function openingOn(calendar: number, name: string) {
  const hours = BRANCH_HOURS[seaBranchName(name)];
  if (!hours) throw new Error('Unknown sea scene branch');
  const minutes = new Date(calendar).getUTCDay() === 5 ? 14 * 60 : timeMinutes(hours.open)!;
  return calendar + minutes * 60000 - RIYADH;
}

export function seaBranchClock(name: string, now: number) {
  const local = new Date(now + RIYADH);
  const calendar = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const opensAt = openingOn(calendar, name);
  const closesAt = calendar + DAY - RIYADH; // All branches close at Riyadh midnight.
  return { opensAt, closesAt, isOpen: now >= opensAt && now < closesAt,
    nextOpening: now < opensAt ? opensAt : openingOn(calendar + DAY, name) };
}

export function seaBranchScene(branch: SeaBranch, now: number): SeaScene {
  const clock = seaBranchClock(branch.name, now);
  // Sleeping uses the same image in daylight and at night; the scene controls lighting.
  if (branch.status === 'waiting' || !clock.isOpen) return 'sleep';
  if (branch.status === 'sunk') return 'distress';
  if (branch.status === 'arrived') return 'celebrate';
  if (now < clock.opensAt + HOUR) return 'coffee';
  const complete = branch.current !== undefined && branch.current.count >= branch.current.target;
  // A missing review time must never create a false visual failure.
  const verified = branch.status !== 'unverified' && !branch.current?.uncertain;
  if (now >= clock.closesAt - HOUR && !complete && verified) return 'distress';
  const midpoint = clock.opensAt + (clock.closesAt - clock.opensAt) / 2;
  return complete && now >= midpoint ? 'celebrate' : 'adventure';
}

export const SEA_SCENE_LABELS: Record<SeaScene, string> = {
  sleep: 'راحة حتى موعد الفتح', coffee: 'قهوة البداية والاستعداد', adventure: 'مغامرة نحو الهدف',
  celebrate: 'احتفال بإنجاز المهمة', distress: 'تحدٍّ بحري شاق',
};
