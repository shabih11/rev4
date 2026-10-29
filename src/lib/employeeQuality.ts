import type { UserAccount } from './mockData';

// Display the existing review-quality credit and complaint/safety credit as one score.
export function employeeQualityPoints(stats: UserAccount['stats']) {
  return Math.min(6, Math.max(0, stats.negative + Math.max(0, 4 - stats.complaints - stats.safety)));
}
