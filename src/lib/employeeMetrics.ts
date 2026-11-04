import type { UserAccount } from './mockData';
import type { ReviewSummary, TimelineEvent } from '../context/DataContext';
import { isCoverageEmployee } from './employeeBranches';
import { isInCurrentMonth, isPositiveReview } from './reviewPeriod';
import { toEnglishNumerals } from './formatDate';

export function enrichEmployees(users: UserAccount[], reviews: ReviewSummary[], notes: TimelineEvent[], resultsDate: Date, ready: boolean, imageUrl: string): UserAccount[] {
    if (!ready) return users.map(user => ({ ...user, imageUrl: imageUrl }));
    return users.map(user => {
      // Force all users to use the unified employee image
      const coverage = user.role === 'employee' && isCoverageEmployee(user);
      const unifiedUser = { ...user, imageUrl: imageUrl, ...(coverage ? { isCoverage: true } : {}) };
      if (unifiedUser.role !== 'employee') return unifiedUser;

      const empReviews = reviews.filter(r => r.linkedEmployeeIds.includes(unifiedUser.id));
      const empTimeline = notes.filter(t => t.employees?.some(e => e.id === unifiedUser.id));

      const now = resultsDate;
      const currentMonthReviews = empReviews.filter(review => isInCurrentMonth(review.date, now));
      const currentMonthTimeline = empTimeline.filter(event => isInCurrentMonth(event.date, now));

      let positiveScore = 0;
      let negativeScore = 2; // base score for negative
      let complaintsScore = 0;
      let safetyScore = 0;
      let monthReviewsBalance = 0;

      currentMonthReviews.forEach(r => {
        const rating = parseInt(toEnglishNumerals(r.rating)) || 0;
        const shareCount = r.linkedEmployeeIds.length || 1;
        if (isPositiveReview(r.rating)) {
          positiveScore += (0.25 / shareCount);
          monthReviewsBalance += (1 / shareCount);
        } else if (rating <= 2 && rating >= 1) {
          negativeScore -= (0.5 / shareCount);
        }
      });

      currentMonthTimeline.forEach(t => {
        if (t.type === 'gap') {
          if (t.title.includes('شكوى')) complaintsScore += 1;
          if (t.title.includes('سلامة')) safetyScore += 1;
        }
      });

      const manual = unifiedUser.manualStats || {};
      positiveScore += (manual.positive || 0);
      negativeScore += (manual.negative || 0);
      complaintsScore += (manual.complaints || 0);
      safetyScore += (manual.safety || 0);
      monthReviewsBalance += (manual.monthReviews || 0);

      if (positiveScore > 5) positiveScore = 5;
      if (negativeScore < 0) negativeScore = 0;

      let qualityScore = 4 - (complaintsScore + safetyScore);
      if (qualityScore < 0) qualityScore = 0;

      const calculatedPoints = positiveScore + negativeScore + qualityScore;

      const totalReviewsCount = empReviews.length;
      const monthReviewsCount = Math.round(monthReviewsBalance * 10) / 10;

      // Return updated user
      return {
        ...unifiedUser,
        points: calculatedPoints,
        reviewsCount: totalReviewsCount,
        monthReviewsCount,
        stats: {
          positive: positiveScore,
          negative: negativeScore,
          complaints: complaintsScore,
          safety: safetyScore
        }
      };
    });
}
