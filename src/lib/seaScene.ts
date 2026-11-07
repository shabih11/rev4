import { BRANCH_HOURS } from './branchHours';
import { timeMinutes } from './formatDate';
import { seaBranchName, seaForegroundBerths, type SeaBranch } from './seaMission';

export type SeaLight = 'sunny' | 'soft' | 'dusk' | 'night';
export type SeaScene = 'sleep' | 'coffee' | 'adventure' | 'halfway' | 'celebrate' | 'distress' | 'capsized' | 'rescue' | 'wreck';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const RIYADH = 3 * HOUR;

export function seaSinkingAge(branch: SeaBranch, now: number) {
  return branch.failedDay ? Math.floor((now + RIYADH) / DAY) - Math.floor((branch.failedDay.end + RIYADH) / DAY) : 0;
}

export function seaWreckVariant(branch: SeaBranch, now: number) {
  return Math.max(0, seaSinkingAge(branch, now) - 2) % 4;
}

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
  if (branch.status === 'sunk') {
    // Use Riyadh calendar days from confirmed elimination, including Friday and month rollover.
    // Incomplete legacy records retain the original scene rather than inventing an age.
    if (!branch.failedDay) return 'capsized';
    const age = seaSinkingAge(branch, now);
    return age <= 0 ? 'capsized' : age === 1 ? 'rescue' : 'wreck';
  }
  const clock = seaBranchClock(branch.name, now);
  // Keep the late distress scene overnight until the business day is resolved at opening.
  if (!clock.isOpen && branch.status === 'sailing' && branch.current && !branch.current.uncertain
    && now >= branch.current.start && now < branch.current.end
    && branch.current.count < Math.ceil(branch.current.target / 2)) return 'distress';
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
  const berths = seaForegroundBerths(branches, now, sleepingUntil);
  const rescuing = branches.filter(branch => seaBranchScene(branch, now) === 'rescue');
  if (!rescuing.length) return berths;
  const rescueRows = Math.ceil(rescuing.length / 2);
  // Reserve separate foreground rows for wide rescue cutouts; ordinary boats stay behind.
  // Stable campaign order avoids moving scenes as results update during the rescue day.
  return berths.map(berth => {
    const index = rescuing.findIndex(branch => branch.name === berth.name);
    if (index >= 0) return { ...berth, x: index % 2 === 0 ? 25 : 75,
      y: (rescueRows === 1 ? 90 : 94 - (rescueRows - 1) * 16) + Math.floor(index / 2) * 16, width: 44 };
    return { ...berth, y: rescueRows === 3 ? 34 + (berth.y - 65) * .18 : 38 + (berth.y - 65) * .25 };
  });
}

export const SEA_SCENE_LABELS: Record<SeaScene, string> = {
  sleep: 'راحة حتى موعد الفتح', coffee: 'قهوة البداية والاستعداد', adventure: 'مغامرة نحو الهدف',
  halfway: 'بلغنا نصف الهدف اليومي — تفقد الجوال وتشجيع الزميلات',
  celebrate: 'احتفال بإنجاز المهمة', distress: 'قارب يغرق والموظفات في الماء',
  capsized: 'قارب مقلوب والموظفات في الماء متمسكات بحافته — خارج المنافسة',
  rescue: 'خفر السواحل ينقذ الموظفات — خارج المنافسة',
  wreck: 'حطام القارب بعد إنقاذ الموظفات — خارج المنافسة',
};
