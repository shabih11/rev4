import { comparisonFromRecords } from '../lib/employeeFeatures';
import { isCoverageEmployee } from '../lib/employeeBranches';
import { useCoverageBranches } from '../hooks/useCoverageBranches';
import type { FeatureState } from '../lib/employeeFeatures';
import { useDailyReadModel } from '../lib/dailyReadModel';
import { supabase } from '../lib/supabase';
import { invalidateRows, readNamespace } from '../lib/browserReadCache';
import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserAccount } from '../lib/mockData';
import employeeImg from '../assets/employee.png';
import { timeMinutes, toEnglishNumerals } from '../lib/formatDate';
import { stripReviewTranslation } from '../lib/windsorIntegration';
import { useCloudSession, useCloudList } from '../lib/cloudSync';
import { combineRecordScopes, type RecordDemand } from '../lib/cloudReadPlan';
import { isInCurrentMonth, isPositiveReview } from '../lib/reviewPeriod';

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

interface DataContextType {
  coverageBranchError: string | null;
  features: FeatureState | null;
  requestRecords: (id: string, demand: RecordDemand | null) => void;
  users: UserAccount[];
  updateUser: (id: string, updates: Partial<UserAccount>) => void;
  addUser: (user: Omit<UserAccount, 'points' | 'reviewsCount'>) => void;
  disabledEmployees: UserAccount[];
  setEmployeeDisabled: (id: string, disabled: boolean) => Promise<boolean>;
  convertToMobile: (id: string) => void;
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

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = useCloudSession();
  const [recordDemands, setRecordDemands] = useState<Record<string, { uid: string | null; demand: RecordDemand }>>({});
  const requestRecords = useCallback((id: string, demand: RecordDemand | null) => {
    setRecordDemands(previous => {
      const next = { ...previous };
      if (demand) next[id] = { uid: session.uid, demand };
      else delete next[id];
      return next;
    });
  }, [session.uid]);
  const demands = Object.values(recordDemands).filter(entry => entry.uid === session.uid).map(entry => entry.demand);
  const reviewScope = combineRecordScopes(demands.map(demand => demand.reviews));
  const timelineScope = combineRecordScopes(demands.map(demand => demand.timeline));
  const daily = useDailyReadModel(session);
  const readSession = React.useMemo(() => ({ ...session, dataVersion: daily.revision }), [session, daily.revision]);
  const legacyRequested = false; // Supabase supplies a complete, permission-checked read model.
  // Automatic recovery when the server summary has not been prepared yet.
  const legacyScope = legacyRequested ? { all: true } : null;
  const legacyDirectory = useCloudList<UserAccount>('profiles', readSession, legacyScope);
  const legacyReviews = useCloudList<ReviewSummary>('reviewSignals', readSession, legacyScope);
  const legacyNotes = useCloudList<TimelineEvent>('noteSignals', readSession, legacyScope);
  const legacyReady = legacyRequested && legacyDirectory.ready && legacyReviews.ready && legacyNotes.ready;
  const userCloud = useCloudList<UserAccount>('users', readSession, daily.ready && demands.some(d => d.users) ? { all: true } : null);
  const reviewCloud = useCloudList<CustomerReview>('reviews', readSession, daily.ready ? reviewScope : null);
  const reviewSignals = { rows: daily.data?.reviews || legacyReviews.rows };
  const noteSignals = { rows: daily.data?.notes || legacyNotes.rows };
  const timelineCloud = useCloudList<TimelineEvent>('timeline', readSession, daily.ready ? timelineScope : null);
  type BranchRecord = { id: string; name: string; start: string; end: string; googleApi?: string; nextDayTime?: string };
  const branchCloud = useCloudList<BranchRecord>('branches', readSession, daily.ready ? { all: true } : null);
  const users = userCloud.rows.length ? userCloud.rows : (daily.data?.directory || legacyDirectory.rows).map(u => u.id === session.account?.id ? session.account : { ...u, email: '' });
  const coverageBranches = useCoverageBranches(users, session, daily.revision, daily.ready);
  const setUsers = userCloud.change;
  const reviews = reviewCloud.rows, setReviews = reviewCloud.change;
  const timeline = timelineCloud.rows, setTimeline = timelineCloud.change;
  const branchSettings = React.useMemo(() => Object.fromEntries(branchCloud.rows.map(({ id, name: _name, ...settings }) => [id, settings])), [branchCloud.rows]);
  const setBranchSettings = (settings: typeof branchSettings) => branchCloud.change(Object.entries(settings).map(([id, value]) => ({ id, name: id, ...value })));
  const clouds = [userCloud, reviewCloud, timelineCloud, branchCloud, legacyDirectory, legacyReviews, legacyNotes];
  const syncError = session.error || (!legacyReady ? daily.error : null) || clouds.find(cloud => cloud.error)?.error || null;
  const syncStatus = !session.account ? 'تسجيل الدخول مطلوب' : syncError ? 'تعذرت المزامنة' : clouds.some(cloud => cloud.pending > 0) ? 'جارٍ حفظ التعديلات…' : clouds.every(cloud => cloud.ready) ? 'متصل بـ Supabase' : 'جارٍ تحميل البيانات…';
  React.useEffect(() => {
    for (const key of ['app_windsor_api_url','app_windsor_api_url_2','app_windsor_branch_mapping','app_verified_windsor_import_report']) {
      try { localStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
    }
    try { indexedDB.deleteDatabase('rev4-read-cache-v1'); } catch { /* The new cache is isolated. */ }
  }, []);

  const updateUser = (id: string, updates: Partial<UserAccount>) => {
    let newUsers: UserAccount[] = [];
    setUsers(prev => {
      newUsers = prev.map(u => u.id === id ? { ...u, ...updates } : u);
      return newUsers;
    });
    
    // Storage now handled by useEffect
  };

  const updateBranchSettings = (branch: string, start: string, end: string, googleApi?: string, nextDayTime?: string) => {
    const current = branchSettings[branch] || {};
    const newSettings = { ...branchSettings, [branch]: { start, end, googleApi: googleApi !== undefined ? googleApi : current.googleApi, nextDayTime: nextDayTime !== undefined ? nextDayTime : current.nextDayTime } };
    setBranchSettings(newSettings);
    try { /* Storage now handled by useEffect */ } catch (e) { console.error(e); }
  };

  const addTimelineComment = (id: string, comment: string) => {
    const newTimeline = timeline.map(t => t.id === id ? { ...t, comment } : t);
    setTimeline(newTimeline);
    try { /* Storage now handled by useEffect */ } catch (e) { console.error(e); }
  };

  const addTimelineEvent = (event: Omit<TimelineEvent, 'id'>) => {
    if (!timelineScope || !timelineCloud.ready) { window.alert('انتظري اكتمال تحميل الشفتات قبل الحفظ'); return; }
    // PostgreSQL validates the shift and links reviews in the same transaction.
    setTimeline(previous => [{ ...event, id: crypto.randomUUID() }, ...previous]);
  };

  const updateTimelineEvent = (id: string, updates: Partial<TimelineEvent>) => {
    setTimeline(previous => previous.map(t => t.id === id ? { ...t, ...updates } : t));
    // Storage now handled by useEffect
  };

  const acceptShiftRequest = (id: string, time: string, endTime: string) => {
    const request = timeline.find(event => event.id === id && event.requestStatus === 'pending');
    if (!request?.date || !request.employees?.length || !timelineCloud.ready) return;
    const first = request.requestedShift === 'first';
    const existing = timeline.find(event => event.type === 'shift' && event.branch === request.branch && event.date === request.date && ((timeMinutes(event.time) ?? 0) < 960) === first);
    const employees = [...(existing?.employees || [])];
    for (const employee of request.employees) if (!employees.some(item => item.id === employee.id)) employees.push(employee);
    const shift: TimelineEvent = existing ? { ...existing, employees } : { id: crypto.randomUUID(), branch: request.branch, type: 'shift', title: first ? 'الشفت الأول' : 'الشفت الثاني', date: request.date, time, endTime, employees };
    // write_rows and the existing relinking trigger save the decision, shift and review links atomically.
    setTimeline(previous => [shift, ...previous.filter(event => event.id !== shift.id).map(event => event.id === id ? { ...event, requestStatus: 'accepted' as const } : event)]);
  };

  const deleteTimelineEvent = (id: string) => {
    const newTimeline = timeline.filter(t => t.id !== id);
    setTimeline(newTimeline);
    // Storage now handled by useEffect
  };

  const undoBatch = (batchId: string) => {
    const newTimeline = timeline.filter(t => t.batchId !== batchId);
    setTimeline(newTimeline);
    // Storage now handled by useEffect
    
    const newReviews = reviews.filter(r => r.batchId !== batchId);
    setReviews(newReviews);
    // Storage now handled by useEffect
  };

  const addUser = (newUser: Omit<UserAccount, 'points' | 'reviewsCount'>) => {
    const userWithDefaults: UserAccount = { ...newUser, points: 0, reviewsCount: 0, mustChangePassword: true };
    const newUsers = [...users, userWithDefaults];
    setUsers(newUsers);
    try {
      // Storage now handled by useEffect
    } catch (e) { console.error(e); }
  };

  const setEmployeeDisabled = async (id: string, disabled: boolean) => {
    if (session.account?.role !== 'admin' || !daily.ready || !users.some(user => user.id === id && user.role === 'employee')) return false;
    try {
      const { error } = await supabase.rpc('set_employee_disabled', { employee_id: id, disabled });
      if (error) return false;
      await invalidateRows(readNamespace(session));
      return true;
    } catch { return false; }
  };

  const convertToMobile = (id: string) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    updateUser(id, {
      branch: 'موظفة خارجية',
      assignedBranches: Array.from(new Set([...(target.assignedBranches || []), target.branch])),
    });
  };

  const mergeEmployees = async (primaryId: string, duplicateId: string, newName?: string, newBranch?: string, coverage?: boolean) => {
    const primary = users.find(u => u.id === primaryId);
    if (!primary || !summaryReadyForMerge()) return false;
    const { error } = await supabase.rpc('merge_employees_with_coverage', { primary_id: primaryId, duplicate_id: duplicateId,
      requested_name: newName?.trim() || primary.name, requested_branch: newBranch || primary.branch, requested_coverage: coverage ?? (primary.isCoverage ?? primary.assignedBranches?.some(branch => branch !== primary.branch) ?? false) });
    if (error) { window.alert('تعذر دمج الموظفات؛ لم تُحفظ أي تغييرات جزئية'); return false; }
    await invalidateRows(readNamespace(session));
    return true;
  };
  const summaryReadyForMerge = () => Boolean(session.account?.role === 'admin' && daily.ready);

  const updateReview = (id: string, updates: Partial<CustomerReview>) => {
    const newReviews = reviews.map(r => r.id === id ? { ...r, ...updates } : r);
    setReviews(newReviews);
    // Storage now handled by useEffect
  };

  const deleteReview = (id: string) => {
    if (!reviewScope || !timelineScope || !reviewCloud.ready || !timelineCloud.ready) {
      window.alert('انتظري اكتمال تحميل التقييمات والشفتات قبل الحذف');
      return;
    }
    const newReviews = reviews.filter(r => r.id !== id);
    setReviews(newReviews);
    deleteTimelineEvent(id);
    // Storage now handled by useEffect
  };

  const parseReviewsText = (branch: string, text: string, batchId?: string) => {
    const reviewBlocks = text.split(/\n\s*\n/);
    let parsedReviews: CustomerReview[] = [];
    let newTimelineEvents: TimelineEvent[] = [];

    reviewBlocks.forEach(block => {
      const idMatch = block.match(/معرف التقييم:\s*(.+)/);
      const nameMatch = block.match(/اسم المقيم:\s*(.+)/);
      const ratingMatch = block.match(/التقييم:\s*(.+)/);
      const commentMatch = block.match(/التعليق:\s*(.+)/);
      const dateMatch = block.match(/التاريخ:\s*(.+)/);
      const timeMatch = block.match(/الوقت:\s*(.+)/);

      if (idMatch && nameMatch && ratingMatch && dateMatch && timeMatch) {
        const id = idMatch[1].trim();
        
        // Check for duplicate in existing and newly parsed
        if (!reviews.find(r => r.id === id) && !parsedReviews.find(r => r.id === id)) {
          const newReview: CustomerReview = {
            id,
            reviewerName: nameMatch[1].trim(),
            rating: ratingMatch[1].trim(),
            comment: commentMatch ? commentMatch[1].trim() : '',
            date: dateMatch[1].trim(),
            time: timeMatch[1].trim(),
            branch,
            linkedEmployeeIds: [],
            batchId
          };

          const linkedEmployees: { id: string; name: string }[] = [];

          parsedReviews.push(newReview);

          newTimelineEvents.push({
            id: id,
            branch,
            type: 'review',
            title: `تقييم جديد (${newReview.rating})`,
            time: newReview.time,
            date: newReview.date,
            comment: newReview.comment,
            employees: linkedEmployees,
            reviewId: id,
            batchId
          });
        }
      }
    });

    return { reviews: parsedReviews, timelineEvents: newTimelineEvents };
  };

  const commitReviews = (newReviews: CustomerReview[], _events: TimelineEvent[]) => {
    setReviews(previous => [...newReviews, ...previous]);
  };

  const commitShifts = (shifts: TimelineEvent[], batchId?: string) => {
    if (!timelineCloud.ready) { window.alert('انتظري اكتمال تحميل الشفتات'); return; }
    setTimeline(previous => [...shifts.map(shift => ({ ...shift, batchId: batchId || shift.batchId })), ...previous]);
  };

  const enrichedUsers = React.useMemo(() => {
    if (!daily.data && !legacyReady) return users.map(user => ({ ...user, imageUrl: employeeImg }));
    return users.map(user => {
      // Force all users to use the unified employee image
      const coverage = user.role === 'employee' && isCoverageEmployee(user);
      const unifiedUser = { ...user, imageUrl: employeeImg, ...(coverage ? { isCoverage: true, branch: coverageBranches.branches[user.id] || user.branch } : {}) };
      if (unifiedUser.role !== 'employee') return unifiedUser;
      
      const empReviews = reviewSignals.rows.filter(r => r.linkedEmployeeIds.includes(unifiedUser.id));
      const empTimeline = noteSignals.rows.filter(t => t.employees?.some(e => e.id === unifiedUser.id));
      
      const now = new Date();
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
  }, [users, reviewSignals.rows, noteSignals.rows, daily.data, legacyReady, coverageBranches.branches]);

  const disabledIds = new Set(daily.data?.disabledEmployeeIds || []);
  const activeUsers = enrichedUsers.filter(user => !disabledIds.has(user.id));
  const disabledEmployees = session.account?.role === 'admin' ? enrichedUsers.filter(user => disabledIds.has(user.id)) : [];
  const featureState = React.useMemo(() => {
    const disabled = new Set(daily.data?.disabledEmployeeIds || []);
    const state = comparisonFromRecords(daily.data?.features || null, enrichedUsers.filter(user => user.role === 'employee' && !disabled.has(user.id)), reviewSignals.rows);
    if (!state?.store) return state;
    return { ...state, store: { ...state.store, collections: state.store.collections.map(collection => ({
      ...collection, variants: collection.variants.map(variant => variant.ownerId && disabled.has(variant.ownerId) ? { ...variant, ownerName: null } : variant),
    })) } };
  }, [daily.data, enrichedUsers, reviewSignals.rows]);

  const clearData = (branch?: string, startDate?: string, endDate?: string) => {
    if (!reviewScope?.all || !timelineScope?.all || !reviewCloud.ready || !timelineCloud.ready) {
      window.alert('انتظري اكتمال تحميل جميع السجلات قبل المسح');
      return;
    }
    // Helper to check if a date string DD-MM-YYYY is between start and end
    const isBetween = (dateStr: string, start?: string, end?: string) => {
      if (!start || !end) return true;
      const dParts = dateStr.split('-');
      if (dParts.length < 3) return false;
      const d = new Date(parseInt(toEnglishNumerals(dParts[2])), parseInt(toEnglishNumerals(dParts[1])) - 1, parseInt(toEnglishNumerals(dParts[0])));
      const s = new Date(start); // assumes YYYY-MM-DD
      const e = new Date(end); // assumes YYYY-MM-DD
      return d >= s && d <= e;
    };

    setTimeline(prev => {
      const updated = prev.filter(t => {
        if (branch && branch !== 'all' && t.branch !== branch) return true; // keep if different branch
        if (startDate && endDate) {
          if (!t.date || !isBetween(t.date, startDate, endDate)) return true; // keep if not in period
        }
        return false; // remove
      });
      return updated;
    });

    setReviews(prev => {
      const updated = prev.filter(r => {
        if (branch && branch !== 'all' && r.branch !== branch) return true;
        if (startDate && endDate) {
          if (!r.date || !isBetween(r.date, startDate, endDate)) return true;
        }
        return false;
      });
      return updated;
    });
  };

  // Historical imports are server-side maintenance operations; never republish embedded data.
  const resetUsersToRoster = () => { window.alert('تتم إدارة الاستيراد التاريخي من أداة الإدارة الآمنة خارج المتصفح'); };
  const resetTimelineToInjectedShifts = resetUsersToRoster;
  const resetReviewsToInjected = resetUsersToRoster;

  const sanitizedReviews = React.useMemo(() => {
    return reviews.map(r => ({ ...r, comment: stripReviewTranslation(r.comment) }));
  }, [reviews]);

  return (
    <DataContext.Provider value={{ 
      coverageBranchError: coverageBranches.error,
      features: featureState,
      requestRecords,
      users: activeUsers, disabledEmployees, updateUser, addUser, setEmployeeDisabled, convertToMobile, mergeEmployees, branchSettings, updateBranchSettings,
      timeline, acceptShiftRequest, addTimelineComment, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent,
      reviews: sanitizedReviews, parseReviewsText, commitReviews, commitShifts, updateReview, deleteReview, undoBatch, clearData,
      resetUsersToRoster,
      resetTimelineToInjectedShifts,
      resetReviewsToInjected,
      reviewSummaries: reviewSignals.rows, recordsReady: (Boolean(reviewScope || timelineScope) || demands.some(d => d.users)) && userCloud.ready && reviewCloud.ready && timelineCloud.ready,
      summaryReady: Boolean(daily.data) || legacyReady, summaryGeneratedAt: daily.data?.generatedAt || '', employeeHours: daily.data?.hours || {},
      currentAccount: session.account, authReady: session.ready, syncStatus, syncError
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
};
