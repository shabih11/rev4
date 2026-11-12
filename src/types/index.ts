export interface Employee {
  id: string;
  name: string;
  branch: string;
  imageUrl: string;
  points: number; // Max 11
  reviewsCount: number;
  stats: {
    positive: number;
    negative: number;
    complaints: number;
    safety: number;
  };
  ordinaryReviewBalance?: number;
  goldPlusCents?: number;
  monthReviewsCount?: number;
  previousMonthWinner?: boolean;
  manualStats?: {
    totalReviews?: number;
    monthReviews?: number;
    positive?: number;
    negative?: number;
    complaints?: number;
    safety?: number;
  };
  assignedBranches?: string[];
  isCoverage?: boolean;
  code?: string;
  aliases?: string[];
}
