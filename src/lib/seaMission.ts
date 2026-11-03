import { BRANCH_HOURS } from './branchHours';
import { timeMinutes, toEnglishNumerals } from './formatDate';

export const SEA_MISSION = { year: 2026, month: 11, firstDay: 5, lastDay: 30, reward: 1000, dailyTarget: 2 } as const;
export const SEA_BRANCHES = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'] as const;
const DAY = 86400000;
const RIYADH_OFFSET = 3 * 3600000;
const aliases: Record<string, string> = { 'الرياض جاليري': 'جاليري', 'القصر مول': 'القصر', 'شرق بلازا': 'شرق' };
export const seaBranchName = (branch: string) => aliases[branch.trim()] || branch.trim();

type Review = { id: string; branch: string; rating: string; date: string; time: string };
export type SeaDay = { day: number; start: number; end: number; count: number; uncertain: boolean };
export type SeaBranch = {
  name: string; status: 'waiting' | 'sailing' | 'sunk' | 'arrived' | 'unverified';
  days: SeaDay[]; current: SeaDay | undefined; failedDay: SeaDay | undefined; progress: number;
};

// UTC is used only as calendar arithmetic. All boundaries are explicitly Riyadh time.
export function seaOpening(branch: string, day: number) {
  const date = new Date(Date.UTC(SEA_MISSION.year, SEA_MISSION.month - 1, day));
  const hours = BRANCH_HOURS[seaBranchName(branch)];
  if (!hours) throw new Error('Unknown sea mission branch');
  const minutes = date.getUTCDay() === 5 ? 14 * 60 : timeMinutes(hours.open)!;
  return date.getTime() + minutes * 60000 - RIYADH_OFFSET;
}

function reviewCalendar(value: string): number | null {
  const raw = toEnglishNumerals(value || '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const local = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (!iso && !local) return null;
  const [year, month, day] = (iso ? [iso[1], iso[2], iso[3]] : [local![3], local![2], local![1]]).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
}

function reviewInstant(review: Review) {
  const calendar = reviewCalendar(review.date);
  const minutes = timeMinutes(review.time);
  if (calendar === null || minutes === null) return null;
  const secondsMatch = /:\d{2}:(\d{2})(?:\s|$)/.exec(toEnglishNumerals(review.time));
  const seconds = Number(secondsMatch?.[1] || 0);
  if (seconds > 59) return null;
  return calendar + minutes * 60000 + seconds * 1000 - RIYADH_OFFSET;
}

export function seaMission(reviews: readonly Review[], now = Date.now()) {
  const seen = new Set<string>();
  const dated: { branch: string; timestamp: number }[] = [];
  const undated: { branch: string; calendar: number }[] = [];
  for (const review of reviews) {
    const rating = Number(toEnglishNumerals(review.rating).trim());
    if (!review.id || seen.has(review.id) || (rating !== 4 && rating !== 5)) continue;
    seen.add(review.id);
    const branch = seaBranchName(review.branch);
    const timestamp = reviewInstant(review);
    if (timestamp !== null && timestamp <= now) dated.push({ branch, timestamp });
    else if (timestamp === null) {
      const calendar = reviewCalendar(review.date);
      if (calendar !== null) undated.push({ branch, calendar });
    }
  }
  const branches: SeaBranch[] = SEA_BRANCHES.map(name => {
    const days: SeaDay[] = Array.from({ length: SEA_MISSION.lastDay - SEA_MISSION.firstDay + 1 }, (_, index) => {
      const day = SEA_MISSION.firstDay + index;
      const start = seaOpening(name, day), end = seaOpening(name, day + 1);
      return { day, start, end, count: dated.filter(review => review.branch === name && review.timestamp >= start && review.timestamp < end).length,
        uncertain: undated.some(review => review.branch === name && review.calendar < end + RIYADH_OFFSET && review.calendar + DAY > start + RIYADH_OFFSET) };
    });
    // The first unresolved/failed business day blocks later days from deciding the result.
    const firstShortDay = days.find(day => now >= day.end && day.count < SEA_MISSION.dailyTarget);
    const uncertain = firstShortDay?.uncertain === true;
    const failedDay = uncertain ? undefined : firstShortDay;
    const current = days.find(day => now >= day.start && now < day.end);
    const status = now < days[0].start ? 'waiting' : uncertain ? 'unverified' : failedDay ? 'sunk' : now >= days.at(-1)!.end ? 'arrived' : 'sailing';
    const elapsed = (Math.min(now, firstShortDay?.end ?? now) - days[0].start) / (days.at(-1)!.end - days[0].start);
    return { name, days, current, status, failedDay, progress: Math.max(0, Math.min(1, elapsed)) };
  });
  const remaining = branches.filter(branch => branch.status !== 'sunk' && branch.status !== 'unverified').length;
  const started = branches.some(branch => branch.status !== 'waiting');
  const finished = branches.every(branch => now >= branch.days.at(-1)!.end);
  const uncertain = branches.some(branch => branch.status === 'unverified');
  return { branches, remaining, started, finished, uncertain,
    share: started && !uncertain && remaining > 0 ? SEA_MISSION.reward / remaining : null };
}
