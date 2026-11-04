import { createContext, useContext } from 'react';
import type { UserAccount } from '../lib/mockData';
import type { FeatureState } from '../lib/employeeFeatures';
import type { RecordDemand } from '../lib/cloudReadPlan';

export interface CustomerReview {
  id: string;
  reviewerName: string;
  rating: string;
  comment: string;
  date: string;
  time: string;
  branch: string;
  linkedEmployeeIds: string[];
  linkedShiftId?: string;
  batchId?: string;
}

export type ReviewSummary = Pick<CustomerReview, 'id' | 'branch' | 'rating' | 'date' | 'time' | 'linkedEmployeeIds'>;

export interface TimelineEvent {
  id: string;
  branch: string;
  type: 'shift' | 'gap' | 'review';
  title: string;
  time: string;
  endTime?: string;
  date?: string;
  endDate?: string;
  comment?: string;
  employees?: { id: string, name: string }[];
  requestStatus?: 'pending' | 'accepted' | 'rejected';
  requestedShift?: 'first' | 'second';
  rejectedAt?: number;
  reviewId?: string;
  batchId?: string;
}

export interface DataContextType {
  resultsMode: boolean;
  resultsDate: Date;
  setResultsMode: (enabled: boolean) => void;
  coverageBranchError: string | null;
  coverageBranches: Record<string, string>;
  features: FeatureState | null;
  requestRecords: (id: string, demand: RecordDemand | null) => void;
  users: UserAccount[];
  updateUser: (id: string, updates: Partial<UserAccount>) => void;
  addUser: (user: Omit<UserAccount, 'points' | 'reviewsCount'>) => void;
  disabledEmployees: UserAccount[];
  setEmployeeDisabled: (id: string, disabled: boolean) => Promise<boolean>;
  transferEmployee: (id: string, branch: string) => Promise<boolean>;
  mergeEmployees: (primaryId: string, duplicateId: string, newName?: string, newBranch?: string, coverage?: boolean) => Promise<boolean>;
  branchSettings: Record<string, { start: string; end: string; googleApi?: string; nextDayTime?: string }>;
  updateBranchSettings: (branch: string, start: string, end: string, googleApi?: string, nextDayTime?: string) => void;
  timeline: TimelineEvent[];
  addTimelineComment: (id: string, comment: string) => void;
  addTimelineEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  updateTimelineEvent: (id: string, updates: Partial<TimelineEvent>) => void;
  deleteTimelineEvent: (id: string) => void;
  acceptShiftRequest: (id: string, time: string, endTime: string) => void;
  reviews: CustomerReview[];
  parseReviewsText: (branch: string, text: string, batchId?: string) => { reviews: CustomerReview[], timelineEvents: TimelineEvent[] };
  commitReviews: (newReviews: CustomerReview[], newTimelineEvents: TimelineEvent[]) => void;
  commitShifts: (shifts: TimelineEvent[], batchId?: string) => void;
  updateReview: (id: string, updates: Partial<CustomerReview>) => void;
  deleteReview: (id: string) => void;
  undoBatch: (batchId: string) => void;
  clearData: (branch?: string, startDate?: string, endDate?: string) => void;
  resetUsersToRoster: () => void;
  resetTimelineToInjectedShifts: () => void;
  resetReviewsToInjected: () => void;
  reviewSummaries: ReviewSummary[];
  recordsReady: boolean;
  summaryReady: boolean;
  summaryGeneratedAt: string;
  employeeHours: Record<string, number>;
  currentAccount: UserAccount | null;
  authReady: boolean;
  syncStatus: string;
  syncError: string | null;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
};
