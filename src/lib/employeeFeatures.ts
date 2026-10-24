export interface FeatureSettings {
  competition: boolean;
  balanceGrowth: boolean;
  tiers: boolean;
  avatars: boolean;
  silverAt: number;
  goldAt: number;
}
export type Tier = 'bronze' | 'silver' | 'gold';
export type Accessory = 'shawl' | 'brooch' | 'veil';
export interface FeatureState {
  settings: FeatureSettings;
  baselineDay: string | null;
  baseline: Record<string, number>;
  accessories: Record<string, Accessory[]>;
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
export function allowedAccessories(tier: Tier): Accessory[] {
  return tier === 'gold' ? ['shawl', 'brooch', 'veil'] : tier === 'silver' ? ['shawl', 'brooch'] : [];
}
export function dailyProgress(employee: { id: string; monthReviewsCount?: number }, employees: { id: string; name: string; monthReviewsCount?: number }[], state: FeatureState | null) {
  const before = state?.baseline[employee.id];
  if (before == null) return { growth: 0, overtaken: [] as string[] };
  const balance = employee.monthReviewsCount || 0;
  return {
    growth: Math.round((balance - before) * 10) / 10,
    overtaken: employees.filter(other => other.id !== employee.id && state?.baseline[other.id] != null && state.baseline[other.id] > before && balance > (other.monthReviewsCount || 0)).map(other => other.name),
  };
}
