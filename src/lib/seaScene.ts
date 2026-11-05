import { BRANCH_HOURS } from './branchHours';
import { timeMinutes } from './formatDate';
import { seaBranchName, seaForegroundBerths, type SeaBranch } from './seaMission';
import type { RiyadhWeather } from './riyadhWeather';

export type SeaLight = 'sunny' | 'soft' | 'night' | 'night-deep';
export type SeaScene = 'sleep' | 'coffee' | 'adventure' | 'celebrate' | 'distress';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const RIYADH = 3 * HOUR;

// The provider's day/night symbol takes precedence over fallback visual hours.
export function seaLight(now: number, weather: RiyadhWeather | null = null): SeaLight {
  const local = new Date(now + RIYADH);
  const hour = local.getUTCHours();
  const day = weather?.symbol.endsWith('_day') ? true : weather?.symbol.endsWith('_night') ? false : hour >= 6 && hour < (weather ? 18 : 19);
  if (day) return hour < 15 && (!weather || weather.cloud < 60) ? 'sunny' : 'soft';
  return hour >= 23 || hour < 5 || (weather && weather.cloud >= 75) ? 'night-deep' : 'night';
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
  const complete = branch.current !== undefined && branch.current.count >= branch.current.target;
  if (complete) return 'celebrate';
  const secondShiftStartsAt = clock.closesAt - 8 * HOUR; // 16:00 Riyadh.
  if (now < clock.opensAt + HOUR || (now >= secondShiftStartsAt && now < secondShiftStartsAt + HOUR)) return 'coffee';
  // A missing review time must never create a false visual failure.
  const verified = branch.status !== 'unverified' && !branch.current?.uncertain;
  if (now >= clock.closesAt - HOUR && !complete && verified) return 'distress';
  return 'adventure';
}

export function seaSceneBerths(branches: readonly SeaBranch[], now: number) {
  const sleepingUntil = new Map(branches.filter(branch => seaBranchScene(branch, now) === 'sleep')
    .map(branch => [branch.name, seaBranchClock(branch.name, now).nextOpening]));
  return seaForegroundBerths(branches, now, sleepingUntil);
}

export const SEA_SCENE_LABELS: Record<SeaScene, string> = {
  sleep: 'راحة حتى موعد الفتح', coffee: 'قهوة البداية والاستعداد', adventure: 'مغامرة نحو الهدف',
  celebrate: 'احتفال بإنجاز المهمة', distress: 'تحدٍّ بحري شاق',
};
