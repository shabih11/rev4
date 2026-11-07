import { BRANCH_HOURS } from './branchHours';
import { timeMinutes, toEnglishNumerals } from './formatDate';

export const SEA_MISSION = { year: 2026, month: 11, firstDay: 5, lastDay: 30, reward: 1000 } as const;
export const SEA_PHASES = [
  { id: 1, firstDay: 5, lastDay: 15, target: 2 },
  { id: 2, firstDay: 16, lastDay: 25, target: 3 },
  { id: 3, firstDay: 26, lastDay: 30, target: 4 },
] as const;
export const SEA_BRANCHES = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'] as const;
const DAY = 86400000;
const RIYADH_OFFSET = 3 * 3600000;
const aliases: Record<string, string> = { 'الرياض جاليري': 'جاليري', 'القصر مول': 'القصر', 'شرق بلازا': 'شرق' };
export const seaBranchName = (branch: string) => aliases[branch.trim()] || branch.trim();

type Review = { id: string; branch: string; rating: string; date: string; time: string };
export type SeaDay = { day: number; phase: number; target: number; minimum: number; start: number; end: number; count: number; completedAt?: number; uncertain: boolean; graceUsed: boolean };
export type SeaBranch = {
  name: string; status: 'waiting' | 'sailing' | 'sunk' | 'arrived' | 'unverified';
  days: SeaDay[]; current: SeaDay | undefined; failedDay: SeaDay | undefined; progress: number;
};

// Stable shuffled lanes keep refreshes from moving boats sideways at random.
function laneHash(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function seaBerths(branches: readonly SeaBranch[], now = Date.now()) {
  const rows = new Map(branches.map(branch => [branch.name, SEA_BRANCHES.indexOf(branch.name as typeof SEA_BRANCHES[number]) < 3 ? 1 : 2]));
  const lastAchievement = new Map<string, number>();
  const events = branches.flatMap(branch => branch.days
    .filter(day => day.completedAt !== undefined && (!branch.failedDay || day.day < branch.failedDay.day)
      && (branch.status !== 'unverified' || day.end <= (branch.days.find(day => day.uncertain && day.count < day.target)?.start ?? 0)))
    .map(day => ({ name: branch.name, day: day.day, at: day.completedAt! }))
  ).sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, 'ar'));
  for (const event of events) {
    lastAchievement.set(event.name, event.at);
    const previous = rows.get(event.name)!;
    // Follow a leader into the next stretch instead of freezing every boat at the front.
    if (previous === 0) {
      for (const [name, row] of rows) if (name !== event.name) rows.set(name, Math.min(2, row + 1));
    }
    rows.set(event.name, Math.max(0, previous - 1));
    if (previous === 1 && [...rows.values()].filter(row => row === 0).length === 3) {
      for (const [name, row] of rows) if (row !== 0) rows.set(name, 2);
    }
  }
  // Pack overflow into the nearest available row, with priority for recent achievers.
  const placedRows = new Map<string, number>();
  const occupancy = [0, 0, 0];
  const placementOrder = [...branches].sort((a, b) => rows.get(a.name)! - rows.get(b.name)!
    || (lastAchievement.get(b.name) ?? 0) - (lastAchievement.get(a.name) ?? 0));
  for (const branch of placementOrder) {
    const preferred = rows.get(branch.name)!;
    const row = [preferred, preferred + 1, preferred + 2, preferred - 1, preferred - 2]
      .find(candidate => candidate >= 0 && candidate <= 2 && occupancy[candidate] < 3)!;
    placedRows.set(branch.name, row);
    occupancy[row]++;
  }
  // The Riyadh calendar date changes the shuffle only at local midnight.
  const seed = new Date(now + RIYADH_OFFSET).toISOString().slice(0, 10);
  const lanes = [...branches].sort((a, b) => laneHash(`${seed}:${a.name}`) - laneHash(`${seed}:${b.name}`));
  return branches.map(branch => {
    const row = placedRows.get(branch.name)!;
    const peers = lanes.filter(peer => placedRows.get(peer.name) === row);
    const lane = peers.findIndex(peer => peer.name === branch.name);
    return { name: branch.name, row, x: (lane + .5) * 100 / peers.length, width: 30 };
  });
}

// Daily, irregular foreground anchors preserve stable positions and achievement depth.
export function seaForegroundBerths(branches: readonly SeaBranch[], now = Date.now(), sleepingUntil: ReadonlyMap<string, number> = new Map()) {
  const seed = new Date(now + RIYADH_OFFSET).toISOString().slice(0, 10);
  const anchors = [{ x: 17, y: 73 }, { x: 49, y: 68 }, { x: 81, y: 76 },
    { x: 23, y: 91 }, { x: 57, y: 87 }, { x: 86, y: 95 }].sort((a, b) => a.y - b.y);
  // The race heads toward the island (smaller y); sleeping branches trail near the viewer.
  const order = [...branches].sort((a, b) => Number(sleepingUntil.has(a.name)) - Number(sleepingUntil.has(b.name))
    || (sleepingUntil.get(a.name) ?? 0) - (sleepingUntil.get(b.name) ?? 0)
    || laneHash(`foreground:${seed}:${a.name}`) - laneHash(`foreground:${seed}:${b.name}`)
    || a.name.localeCompare(b.name, 'ar'));
  return seaBerths(branches, now).map(berth => {
    const anchor = anchors[order.findIndex(branch => branch.name === berth.name)]!;
    const jitter = laneHash(`offset:${seed}:${berth.name}`);
    return { ...berth, x: anchor.x + (jitter % 41 - 20) / 10,
      y: anchor.y + ((jitter >>> 8) % 11 - 5) / 10 + (berth.row - 1) * 1.2 };
  });
}

// UTC is used only as calendar arithmetic. All boundaries are explicitly Riyadh time.
export function seaOpening(branch: string, day: number) {
  const date = new Date(Date.UTC(SEA_MISSION.year, SEA_MISSION.month - 1, day));
  const hours = BRANCH_HOURS[seaBranchName(branch)];
  if (!hours) throw new Error('Unknown sea mission branch');
  const minutes = date.getUTCDay() === 5 ? 14 * 60 : timeMinutes(hours.open)!;
  return date.getTime() + minutes * 60000 - RIYADH_OFFSET;
}

export function seaDailyRule(day: number) {
  const phase = SEA_PHASES.find(phase => day >= phase.firstDay && day <= phase.lastDay);
  if (!phase) throw new Error('Day outside sea mission');
  return { phase: phase.id, target: phase.target, minimum: Math.ceil(phase.target / 2) };
}

// The shared camera advances once per competition day, even if all boats have sunk.
export function seaJourneyProgress(now = Date.now()) {
  let stage = 0;
  for (let day = SEA_MISSION.firstDay; day <= SEA_MISSION.lastDay; day++) {
    const opening = Math.min(...SEA_BRANCHES.map(branch => seaOpening(branch, day)));
    if (now < opening) break;
    stage = day - SEA_MISSION.firstDay;
  }
  return stage / (SEA_MISSION.lastDay - SEA_MISSION.firstDay);
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
      const rule = seaDailyRule(day);
      const timestamps = dated.filter(review => review.branch === name && review.timestamp >= start && review.timestamp < end).map(review => review.timestamp).sort((a, b) => a - b);
      return { day, ...rule, start, end, graceUsed: false, count: timestamps.length, completedAt: timestamps[rule.target - 1],
        uncertain: undated.some(review => review.branch === name && review.calendar < end + RIYADH_OFFSET && review.calendar + DAY > start + RIYADH_OFFSET) };
    });
    const usedGraces = new Set<number>();
    let blockedDay: SeaDay | undefined;
    let failedDay: SeaDay | undefined;
    // Resolve closed business days in order. Each phase has its own non-transferable grace.
    for (const day of days) {
      if (now < day.end) break;
      if (day.count >= day.target) continue;
      // An unknown timestamp can change whether this day needs a grace at all.
      if (day.uncertain) { blockedDay = day; break; }
      if (day.count >= day.minimum && !usedGraces.has(day.phase)) {
        usedGraces.add(day.phase);
        day.graceUsed = true;
      } else { failedDay = day; break; }
    }
    const uncertain = Boolean(blockedDay);
    const current = days.find(day => now >= day.start && now < day.end);
    const status = now < days[0].start ? 'waiting' : uncertain ? 'unverified' : failedDay ? 'sunk' : now >= days.at(-1)!.end ? 'arrived' : 'sailing';
    const elapsed = (Math.min(now, (blockedDay || failedDay)?.end ?? now) - days[0].start) / (days.at(-1)!.end - days[0].start);
    return { name, days, current, status, failedDay, progress: Math.max(0, Math.min(1, elapsed)) };
  });
  const remaining = branches.filter(branch => branch.status !== 'sunk' && branch.status !== 'unverified').length;
  const started = branches.some(branch => branch.status !== 'waiting');
  const finished = branches.every(branch => now >= branch.days.at(-1)!.end);
  const uncertain = branches.some(branch => branch.status === 'unverified');
  return { branches, remaining, started, finished, uncertain, journeyProgress: seaJourneyProgress(now),
    share: started && !uncertain && remaining > 0 ? SEA_MISSION.reward / remaining : null };
}
