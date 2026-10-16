import type { Employee } from '../types';

export interface ReviewDoc {
  id: string;
  rating: number; // 1 to 5
  timestamp: number;
  sharedCount: number; // Number of employees sharing this review (same shift)
}

export interface ComplaintDoc {
  id: string;
  daysWorked: number;
}

export interface SafetyNoteDoc {
  id: string;
}

/**
 * Calculate the total score and sub-scores for an employee based on the rules.
 */
export function calculateEmployeeScore(
  reviews: ReviewDoc[],
  complaints: ComplaintDoc[],
  safetyNotes: SafetyNoteDoc[]
): Employee['stats'] & { totalPoints: number } {
  
  let positiveScore = 0;
  let negativeScore = 2; // Default starting balance
  let complaintsScore = 2; // Default starting balance
  let safetyScore = 2; // Default starting balance

  // 1. Process Reviews
  reviews.forEach(review => {
    if (review.rating >= 4) {
      // Positive Review: +0.25 divided by number of sharing employees
      const addition = 0.25 / review.sharedCount;
      positiveScore += addition;
    } else if (review.rating <= 2) {
      // Negative Review: -0.5 divided by number of sharing employees
      const deduction = 0.5 / review.sharedCount;
      negativeScore -= deduction;
    }
    // Rating 3 is neutral, does nothing.
  });

  // Cap positive score at 5 max
  if (positiveScore > 5) positiveScore = 5;
  // Floor negative score at 0 min
  if (negativeScore < 0) negativeScore = 0;

  // 2. Process Complaints
  complaints.forEach(complaint => {
    if (complaint.daysWorked > 0) {
      const deduction = 2 / complaint.daysWorked;
      complaintsScore -= deduction;
    }
  });
  if (complaintsScore < 0) complaintsScore = 0;

  // 3. Process Safety Notes
  safetyNotes.forEach(() => {
    safetyScore -= 1;
  });
  if (safetyScore < 0) safetyScore = 0;

  const totalPoints = positiveScore + negativeScore + complaintsScore + safetyScore;

  return {
    positive: positiveScore,
    negative: negativeScore,
    complaints: complaintsScore,
    safety: safetyScore,
    totalPoints: Number(totalPoints.toFixed(2)) // Round to 2 decimal places
  };
}

/**
 * Function to link reviews to shifts automatically based on timestamp
 */
export function linkReviewToShifts(reviewTimestamp: number, shifts: {employeeId: string, startTime: number, endTime: number}[]) {
  return shifts.filter(shift => reviewTimestamp >= shift.startTime && reviewTimestamp <= shift.endTime);
}
