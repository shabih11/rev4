import type { Tier } from './employeeFeatures';

export interface RewardEmployee {
  id: string;
  points: number;
  monthReviewsCount?: number;
}

export interface EmployeeReward {
  // Display tier: the silver badge requires eight actual points.
  tier: Tier;
  qualifyingPoints: number;
  base: number;
  total: number;
  increase: number;
}

// Badge categories use monthly points out of eleven. Monetary eligibility
// is calculated separately so rounding can grant a reward without a silver badge.
export function rewardTier(points: number, rounding: boolean): Tier {
  if (!Number.isFinite(points) || points < 8 || points > 11) return 'bronze';
  // The actual eight-point minimum takes precedence over rounding.
  const qualifying = rounding ? Math.ceil(points) : points;
  return qualifying >= 11 ? 'gold' : qualifying >= 8 ? 'silver' : 'bronze';
}

export function calculateEmployeeRewards(employees: RewardEmployee[], rounding = false) {
  const bases = employees.map(employee => {
    const tier = rewardTier(employee.points, rounding);
    const validPoints = Number.isFinite(employee.points) && employee.points >= 0 && employee.points <= 11;
    const qualifyingPoints = validPoints ? (rounding ? Math.ceil(employee.points) : employee.points) : 0;
    const monetaryTier = rewardTier(qualifyingPoints, false);
    const balance = employee.monthReviewsCount;
    const rate = monetaryTier === 'gold' ? 14 : monetaryTier === 'silver' ? 10 : 0;
    const cents = balance !== undefined && Number.isFinite(balance) && balance >= 7.1 ? Math.round(balance * rate * 100) : 0;
    return { employee, tier, qualifyingPoints, cents: Number.isSafeInteger(cents) ? cents : 0 };
  });
  const eligible = bases.filter(item => item.cents > 0);
  const lowest = eligible.reduce((minimum, item) => Math.min(minimum, item.cents), Infinity);
  const commonCents = rounding && eligible.length ? Math.max(0, 10000 - lowest) : 0;
  const rewards: Record<string, EmployeeReward> = {};
  for (const { employee, tier, qualifyingPoints, cents } of bases) {
    let total = cents;
    if (rounding && cents > 0) {
      // Combine the shared uplift before rounding, rather than adding two bonuses.
      const rounded = Math.ceil((cents + commonCents) / 1000) * 1000;
      // Preserve whole tens and the increase cap for the shared uplift.
      const capped = Math.floor((cents + 2000) / 1000) * 1000;
      total = Math.min(rounded, capped);
    }
    // The minimum is unconditional for recipients; it is the sole cap exception.
    if (cents > 0) total = Math.max(10000, total);
    rewards[employee.id] = {
      tier,
      qualifyingPoints,
      base: cents / 100,
      total: total / 100,
      increase: (total - cents) / 100,
    };
  }
  return { rewards, commonIncrease: commonCents / 100 };
}
