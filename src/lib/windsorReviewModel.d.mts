import type { CustomerReview } from '../context/DataContext';
export function stripReviewTranslation(comment?: string): string;
export function normalizeWindsorReviews(rawData: unknown, mapping?: Record<string, string>): Omit<CustomerReview, 'linkedEmployeeIds'>[];
