import { toEnglishNumerals } from './formatDate';

const riyadhFormatter = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'numeric', day: 'numeric' });

function recordDay(date: string | undefined): number | null {
  if (!date) return null;
  const normalized = toEnglishNumerals(date);
  const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(normalized);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match && !iso) return null;
  const [day, month, year] = (match ? [match[1], match[2], match[3]] : [iso![3], iso![2], iso![1]]).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return parsed.getTime();
}

function riyadhCalendar(now: Date) {
  const parts = riyadhFormatter.formatToParts(now);
  const part = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

export function previousMonthEnd(now = new Date()): Date {
  const { year, month } = riyadhCalendar(now);
  return new Date(Date.UTC(year, month - 1, 1) - 3 * 3600000 - 1);
}

// Include the entire cutoff date in Riyadh; undated/invalid records cannot be dated historically.
export function isOnOrBeforeDate(date: string | undefined, cutoff: Date): boolean {
  const stamp = recordDay(date);
  const { year, month, day } = riyadhCalendar(cutoff);
  return stamp !== null && stamp <= Date.UTC(year, month - 1, day);
}

export function recordsThroughDate<T extends { date?: string }>(rows: T[], cutoff: Date): T[] {
  const { year, month, day } = riyadhCalendar(cutoff);
  const end = Date.UTC(year, month - 1, day);
  return rows.filter(row => {
    const stamp = recordDay(row.date);
    return stamp !== null && stamp <= end;
  });
}

export function rocketLaunchBranches(reviews: readonly { date: string; branch: string }[], today: string): ReadonlySet<string> {
  const start = Date.UTC(2026, 6, 1);
  const end = recordDay(today);
  const countsByBranch = new Map<string, Map<number, number>>();
  const qualified = new Set<string>();
  if (end === null) return qualified;

  for (const { branch, date } of reviews) {
    const day = recordDay(date);
    if (!branch || day === null || day < start || day > end) continue;
    const counts = countsByBranch.get(branch) ?? new Map<number, number>();
    counts.set(day, (counts.get(day) ?? 0) + 1);
    countsByBranch.set(branch, counts);
  }

  for (const [branch, counts] of countsByBranch) {
    const days = [...counts].sort(([a], [b]) => a - b);
    let first = 0;
    let total = 0;
    for (const [day, count] of days) {
      total += count;
      while (day - days[first][0] >= 7 * 86_400_000) {
        total -= days[first][1];
        first++;
      }
      if (total >= 100) {
        qualified.add(branch);
        break;
      }
    }
  }
  return qualified;
}

export function sundayCoffeeWinner(reviews: readonly { date: string; branch: string }[]): string | null {
  const start = Date.UTC(2026, 10, 5);
  const end = Date.UTC(2026, 10, 7);
  const counts = new Map<string, number>();
  for (const { date, branch } of reviews) {
    const day = recordDay(date);
    if (!branch || day === null || day < start || day > end) continue;
    counts.set(branch, (counts.get(branch) ?? 0) + 1);
  }

  let winner: string | null = null;
  let highest = 0;
  for (const [branch, count] of counts) {
    if (count > highest) {
      highest = count;
      winner = branch;
    } else if (count === highest) {
      winner = null;
    }
  }
  return winner;
}

// Review dates are stored in Riyadh's local calendar.
export function isInCurrentMonth(date: string | undefined, now = new Date()): boolean {
  const stamp = recordDay(date);
  if (stamp === null) return false;
  const parsed = new Date(stamp);
  const { year, month, day } = riyadhCalendar(now);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() <= day;
}

export const isPositiveReview = (rating: string) => {
  const value = parseInt(toEnglishNumerals(rating), 10);
  return value === 4 || value === 5;
};
