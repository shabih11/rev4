export interface FeatureSettings {
  competition: boolean;
  balanceGrowth: boolean;
  tiers: boolean;
  avatars: boolean;
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
export const defaultFeatures: FeatureSettings = { competition: false, balanceGrowth: false, tiers: false, avatars: false, silverAt: 8, goldAt: 11 };
export function employeeTier(points: number, settings: FeatureSettings): Tier {
  if (!settings.tiers || !Number.isFinite(points)) return 'bronze';
  return points >= settings.goldAt ? 'gold' : points >= settings.silverAt ? 'silver' : 'bronze';
}
export function validFeatureSettings(value: FeatureSettings) {
  return ['competition', 'balanceGrowth', 'tiers', 'avatars'].every(key => typeof value[key as keyof FeatureSettings] === 'boolean') &&
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
  if (state.comparisonSource === 'snapshot' && state.baselineDay === today) return state;
  const baseline = Object.fromEntries(employees.map(employee => [employee.id, employee.manualStats?.monthReviews || 0]));
  for (const review of reviews) {
    const day = dayKey(review.date);
    const rating = review.rating.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
    if (!day || !day.startsWith(today.slice(0, 7)) || day >= today || !['4', '5'].includes(rating)) continue;
    const ids = [...new Set(review.linkedEmployeeIds)];
    for (const id of ids) if (id in baseline) baseline[id] += 1 / ids.length;
  }
  for (const id of Object.keys(baseline)) baseline[id] = Math.round((baseline[id] + Number.EPSILON) * 10) / 10;
  return { ...state, baseline, baselineDay: today, comparisonSource: 'records' };
}
const order = (a: RankedEmployee, b: RankedEmployee) => (b.monthReviewsCount || 0) - (a.monthReviewsCount || 0) || a.name.localeCompare(b.name, 'ar') || a.id.localeCompare(b.id);
export function dailyProgress(employee: RankedEmployee, employees: RankedEmployee[], state: FeatureState | null) {
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
  return {
    growth: Math.round(((employee.monthReviewsCount || 0) - before) * 10) / 10,
    rankGain: Math.max(0, previousIndex - currentIndex),
    overtaken: current.slice(currentIndex + 1).filter(other => previousRanks.get(other.id)! < previousIndex).map(other => other.name),
  };
}
