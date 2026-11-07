import { BRANCH_HOURS } from './branchHours';
import { timeMinutes } from './formatDate';
import { seaBranchName, seaForegroundBerths, type SeaBranch } from './seaMission';

export type SeaLight = 'sunny' | 'soft' | 'dusk' | 'night';
export type SeaScene = 'sleep' | 'coffee' | 'adventure' | 'halfway' | 'celebrate' | 'distress' | 'capsized';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const RIYADH = 3 * HOUR;

// Fixed Riyadh wall-clock phases; weather effects never move these boundaries.
export function seaLight(now: number): SeaLight {
  const local = new Date(now + RIYADH);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < 6 * 60 + 30) return 'night';
  if (minutes < 17 * 60) return 'sunny';
  if (minutes < 23 * 60) return 'soft';
  return 'dusk';
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
  // Elimination is confirmed at the next business-day boundary. It persists overnight.
  if (branch.status === 'sunk') return 'capsized';
  const clock = seaBranchClock(branch.name, now);
  // Sleeping uses the same image in daylight and at night; the scene controls lighting.
  if (branch.status === 'waiting' || !clock.isOpen) return 'sleep';
  if (branch.status === 'arrived') return 'celebrate';
  const complete = branch.current !== undefined && branch.current.count >= branch.current.target;
  if (complete) return 'celebrate';
  // Use only this business day's count, and round odd targets up to the next review.
  if (branch.current && !complete && branch.current.count >= Math.ceil(branch.current.target / 2)) return 'halfway';
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
  halfway: 'بلغنا نصف الهدف اليومي — تفقد الجوال وتشجيع الزميلات',
  celebrate: 'احتفال بإنجاز المهمة', distress: 'قارب يغرق والموظفات في الماء',
  capsized: 'قارب مقلوب والموظفات في الماء متمسكات بحافته — خارج المنافسة',
};
