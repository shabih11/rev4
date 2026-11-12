import type { UserAccount } from './mockData';
import { riyadhDay } from './employeeFeatures';

export interface AvatarPrivilegeUse {
  id: number; period: string; actor: string; kind: 'erase' | 'complete'; reviewId: string | null;
  recipients: string[]; gold: boolean; targetPoints: number | null; usedAt: string;
}
export interface AvatarSeaReturn { branch: string; day: number; actor: string; usedAt: string }
export interface FrozenReward {
  points: number; monthReviewsCount: number; goldPlusCents: number;
  tier: 'bronze' | 'silver' | 'gold'; qualifyingPoints: number;
  base: number; total: number; increase: number;
}
export interface AvatarPrivilegeState {
  uses: AvatarPrivilegeUse[];
  seaReturns: AvatarSeaReturn[];
  purchaseMonths: string[];
  closures: { period: string; closedAt: string; snapshot: Record<string, FrozenReward> }[];
}
export const monthOf = (date: Date) => `${riyadhDay(date).slice(0, 7)}-01`;
export function completeAvatarPoints(points: number, target: number | null) {
  return target !== null && target > points && target - points <= 0.5 + 1e-9 ? target : points;
}
// Shared with monetary eligibility; deficits over .20 remain outside general rounding.
export function roundedQualifyingPoints(points: number, rounding: boolean) {
  if (!rounding || !Number.isFinite(points)) return points;
  return [8, 11].find(target => target > points && target - points <= 0.20 + 1e-9) ?? points;
}
export function applyAvatarCompletion(employee: UserAccount, state: AvatarPrivilegeState | undefined, period: string): UserAccount {
  const uses = state?.uses.filter(use => use.period === period && use.recipients.includes(employee.id)) ?? [];
  const points = uses.filter(use => use.kind === 'complete').reduce((points, use) => completeAvatarPoints(points, use.targetPoints), employee.points);
  const frozen = state?.closures.find(closure => closure.period === period)?.snapshot[employee.id];
  return { ...employee, points, ...(frozen ? { points: frozen.points, monthReviewsCount: frozen.monthReviewsCount, goldPlusCents: frozen.goldPlusCents, frozenReward: frozen } : {}) };
}
