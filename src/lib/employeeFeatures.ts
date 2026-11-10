import type { MagicState } from './gems';
export interface FeatureSettings {
  competition: boolean;
  balanceGrowth: boolean;
  tiers: boolean;
  avatars: boolean;
  rounding?: boolean;
  missions?: boolean;
  branchBadges?: boolean;
  silverAt: number;
  goldAt: number;
}
export type Tier = 'bronze' | 'silver' | 'gold';
export interface FeatureState {
  settings: FeatureSettings;
  baselineDay: string | null;
  baseline: Record<string, number>;
  comparisonSource?: 'records' | 'snapshot';
  store?: AvatarStoreState | null;
}
export const defaultFeatures: FeatureSettings = { competition: false, balanceGrowth: false, tiers: false, avatars: false, rounding: false, missions: false, branchBadges: false, silverAt: 8, goldAt: 11 };
export function employeeTier(points: number, settings: FeatureSettings): Tier {
  if (!settings.tiers || !Number.isFinite(points) || points < 8) return 'bronze';
  return points >= settings.goldAt ? 'gold' : points >= settings.silverAt ? 'silver' : 'bronze';
}
export function validFeatureSettings(value: FeatureSettings) {
  return ['competition', 'balanceGrowth', 'tiers', 'avatars'].every(key => typeof value[key as keyof FeatureSettings] === 'boolean') &&
    (value.rounding === undefined || typeof value.rounding === 'boolean') &&
    (value.missions === undefined || typeof value.missions === 'boolean') &&
    (value.branchBadges === undefined || typeof value.branchBadges === 'boolean') &&
    Number.isFinite(value.silverAt) && Number.isFinite(value.goldAt) && value.silverAt > 0 && value.silverAt < value.goldAt && value.goldAt <= 11;
}
export interface AvatarVariant {
  id: string; name: string; imagePath: string; enabled: boolean;
  ownerId: string | null; ownerName: string | null;
}
export interface AvatarCollection {
  id: string; name: string; price: number; enabled: boolean; variants: AvatarVariant[];
}
export interface AvatarStoreState {
  magic?: MagicState | null;
  collections: AvatarCollection[];
  wallet: { earned: number; spent: number; available: number } | null;
  equipped: Record<string, string>;
  selectedVariant: string | null;
}
type RankedEmployee = { id: string; name: string; monthReviewsCount?: number; manualStats?: { monthReviews?: number } };
export function riyadhDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function dayKey(value: string) {
  const normalized = value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
  const parts = normalized.split('-');
  if (parts.length !== 3) return '';
  const [year, month, day] = parts[0].length === 4 ? parts.map(Number) : [...parts].reverse().map(Number);
  if (![year, month, day].every(Number.isInteger) || year < 1000) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}
export function comparisonFromRecords(state: FeatureState | null, employees: RankedEmployee[], reviews: { date: string; rating: string; linkedEmployeeIds: string[] }[], now = new Date()): FeatureState | null {
  if (!state) return null;
  const today = riyadhDay(now);
  // Keep the last day's progress through midnight and quiet days, until new
  // linked reviews arrive. Reconstruct from shared records, never browser storage.
  const employeeIds = new Set(employees.map(employee => employee.id));
  let activityDay = '';
  for (const review of reviews) {
    const day = dayKey(review.date);
    if (day.startsWith(today.slice(0, 7)) && day <= today && day > activityDay && review.linkedEmployeeIds.some(id => employeeIds.has(id))) activityDay = day;
  }
  const comparisonDay = activityDay || today;
  if (state.comparisonSource === 'snapshot' && state.baselineDay === comparisonDay) return state;
  const baseline = Object.fromEntries(employees.map(employee => [employee.id, employee.manualStats?.monthReviews || 0]));
  for (const review of reviews) {
    const day = dayKey(review.date);
    const rating = review.rating.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
    if (!day || !day.startsWith(today.slice(0, 7)) || day >= comparisonDay || !['4', '5'].includes(rating)) continue;
    const ids = [...new Set(review.linkedEmployeeIds)];
    for (const id of ids) if (id in baseline) baseline[id] += 1 / ids.length;
  }
  for (const id of Object.keys(baseline)) baseline[id] = Math.round((baseline[id] + Number.EPSILON) * 10) / 10;
  return { ...state, baseline, baselineDay: comparisonDay, comparisonSource: 'records' };
}
const order = (a: RankedEmployee, b: RankedEmployee) => (b.monthReviewsCount || 0) - (a.monthReviewsCount || 0) || a.name.localeCompare(b.name, 'ar') || a.id.localeCompare(b.id);
export function dailyProgress(employee: RankedEmployee, employees: RankedEmployee[], state: FeatureState | null, now = new Date()) {
  const before = state?.baseline[employee.id];
  const empty = { growth: 0, rankGain: 0, overtaken: [] as string[] };
  if (before == null || !state) return empty;
  const comparable = employees.filter(other => state.baseline[other.id] != null);
  const previous = [...comparable].map(other => ({ ...other, monthReviewsCount: state.baseline[other.id] })).sort(order);
  const current = [...employees].sort(order);
  const previousIndex = previous.findIndex(other => other.id === employee.id);
  const currentIndex = current.findIndex(other => other.id === employee.id);
  if (previousIndex < 0 || currentIndex < 0) return empty;
  const previousRanks = new Map(previous.map((other, index) => [other.id, index]));
  const showOvertakes = Number(riyadhDay(now).slice(-2)) > 3;
  const overtaken = showOvertakes ? current.slice(currentIndex + 1).filter(other =>
    (other.monthReviewsCount || 0) > 0 && state.baseline[other.id] > 0 &&
    previousRanks.get(other.id)! < previousIndex
  ).map(other => other.name) : [];
  return {
    growth: Math.round(((employee.monthReviewsCount || 0) - before) * 10) / 10,
    rankGain: Math.min(Math.max(0, previousIndex - currentIndex), overtaken.length),
    overtaken,
  };
}
