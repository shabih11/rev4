import type { UserAccount } from './mockData';
import type { ReviewSummary, TimelineEvent } from '../context/DataContext';
import { isCoverageEmployee } from './employeeBranches';
import { previousMonthEnd, recordsThroughDate, isInCurrentMonth, isPositiveReview } from './reviewPeriod';
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
      let goldPlusShare = 0;
      let goldPlusCents = 0;

      currentMonthReviews.forEach(r => {
        const rating = parseInt(toEnglishNumerals(r.rating)) || 0;
        const shareCount = r.linkedEmployeeIds.length || 1;
        if (isPositiveReview(r.rating)) {
          positiveScore += (0.25 / shareCount);
          monthReviewsBalance += (1 / shareCount);
          if (r.avatarRewardEmployeeIds?.includes(unifiedUser.id) ?? r.goldPlus) {
            const members = [...new Set(r.linkedEmployeeIds)].sort();
            goldPlusShare += 1 / members.length;
            goldPlusCents += Math.floor(1600 / members.length) + Number(members.indexOf(unifiedUser.id) < 1600 % members.length);
          }
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

      // Surplus monthly review shares remain available for later negative reviews.
      const recovery = Math.max(0, monthReviewsBalance - 20) * 0.125;
      negativeScore = Math.min(2, Math.max(0, negativeScore + recovery));
      if (positiveScore > 5) positiveScore = 5;

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
        ordinaryReviewBalance: Math.round((monthReviewsBalance - goldPlusShare) * 10) / 10,
        goldPlusCents,
        stats: {
          positive: positiveScore,
          negative: negativeScore,
          complaints: complaintsScore,
          safety: safetyScore
        }
      };
    });
}

// A completed month's winner wears the crown for the following calendar month.
export function previousMonthWinnerIds(users: UserAccount[], reviews: ReviewSummary[], notes: TimelineEvent[], now: Date): Set<string> {
  const cutoff = previousMonthEnd(now);
  const ranked = enrichEmployees(users, recordsThroughDate(reviews, cutoff), recordsThroughDate(notes, cutoff), cutoff, true, '')
    .filter(user => user.role === 'employee');
  const best = Math.max(0, ...ranked.map(user => user.monthReviewsCount ?? 0));
  return new Set(ranked.filter(user => best > 0 && user.monthReviewsCount === best).map(user => user.id));
}
