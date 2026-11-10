import { createEmployeeActions } from '../lib/employeeActions';
import { createTimelineActions } from '../lib/timelineActions';
import { createReviewActions } from '../lib/reviewActions';
import { enrichEmployees } from '../lib/employeeMetrics';
import { comparisonFromRecords } from '../lib/employeeFeatures';
import { useSeaCompletions } from '../hooks/useSeaCompletions';
import { seaMission } from '../lib/seaMission';
import { useCoverageBranches } from '../hooks/useCoverageBranches';
import { useDailyReadModel } from '../lib/dailyReadModel';
import { supabase } from '../lib/supabase';
import { invalidateRows, readNamespace } from '../lib/browserReadCache';
import React, { useState, useCallback } from 'react';
import type { UserAccount } from '../lib/mockData';
import employeeImg from '../assets/employee.png';
import { stripReviewTranslation } from '../lib/windsorIntegration';
import { useCloudSession, useCloudList } from '../lib/cloudSync';
import { combineRecordScopes, type RecordDemand } from '../lib/cloudReadPlan';
import { recordsThroughDate, previousMonthEnd, rocketLaunchBranches, sundayCoffeeWinner } from '../lib/reviewPeriod';

import { DataContext, type CustomerReview, type ReviewSummary, type TimelineEvent } from './DataContext';

const emptyReviews: ReviewSummary[] = [];
const emptyTimeline: TimelineEvent[] = [];

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = useCloudSession();
  const [resultsOwner, setResultsOwner] = useState<string | null>(null);
  const resultsMode = Boolean(session.uid && resultsOwner === session.uid);
  const setResultsMode = (enabled: boolean) => setResultsOwner(enabled ? session.uid : null);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const resultsDate = React.useMemo(() => resultsMode ? previousMonthEnd(new Date(`${today}T12:00:00+03:00`)) : new Date(`${today}T12:00:00+03:00`), [resultsMode, today]);
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
  const userCloud = useCloudList<UserAccount>('users', readSession, daily.ready && demands.some(d => d.users) ? { all: true } : null);
  const reviewCloud = useCloudList<CustomerReview>('reviews', readSession, daily.ready ? reviewScope : null);
  const allReviewSignals = daily.data?.reviews || emptyReviews;
  const branchesWithReviewMilestone = React.useMemo(() => {
    const counts = new Map<string, number>();
    const qualified = new Set<string>();
    for (const { branch } of allReviewSignals) {
      const count = (counts.get(branch) ?? 0) + 1;
      counts.set(branch, count);
      if (count === 1000) qualified.add(branch);
    }
    return qualified;
  }, [allReviewSignals]);
  const seaApprovals = useSeaCompletions(session.account?.id);
  const { completions, ready: seaApprovalsReady } = seaApprovals;
  const seaWinningBranches = React.useMemo(() => {
    if (!seaApprovalsReady) return new Set<string>();
    const mission = seaMission(allReviewSignals, Date.now(), completions);
    return new Set(mission.finished ? mission.branches.filter(branch => branch.status === 'arrived').map(branch => branch.name) : []);
  }, [allReviewSignals, completions, seaApprovalsReady]);
  const rocketLaunchWinningBranches = React.useMemo(() => rocketLaunchBranches(allReviewSignals, today), [allReviewSignals, today]);
  const sundayCoffeeWinningBranch = React.useMemo(() => sundayCoffeeWinner(allReviewSignals), [allReviewSignals]);
  const allNoteSignals = daily.data?.notes || emptyTimeline;
  const reviewSignals = { rows: React.useMemo(() => resultsMode ? recordsThroughDate(allReviewSignals, resultsDate) : allReviewSignals, [allReviewSignals, resultsMode, resultsDate]) };
  const noteSignals = { rows: React.useMemo(() => resultsMode ? recordsThroughDate(allNoteSignals, resultsDate) : allNoteSignals, [allNoteSignals, resultsMode, resultsDate]) };
  const timelineCloud = useCloudList<TimelineEvent>('timeline', readSession, daily.ready ? timelineScope : null);
  type BranchRecord = { id: string; name: string; start: string; end: string; googleApi?: string; nextDayTime?: string };
  const branchCloud = useCloudList<BranchRecord>('branches', readSession, daily.ready ? { all: true } : null);
  const users = userCloud.rows.length ? userCloud.rows : (daily.data?.directory || []).map(u => u.id === session.account?.id ? session.account : { ...u, email: '' });
  const coverageBranches = useCoverageBranches(users, session, daily.revision, daily.ready, resultsMode ? resultsDate.toISOString() : undefined);
  const setUsers = userCloud.change;
  const reviews = reviewCloud.rows, setReviews = reviewCloud.change;
  const timeline = timelineCloud.rows, setTimeline = timelineCloud.change;
  const branchSettings = React.useMemo(() => Object.fromEntries(branchCloud.rows.map(({ id, name: _name, ...settings }) => [id, settings])), [branchCloud.rows]);
  const setBranchSettings = (settings: typeof branchSettings) => branchCloud.change(Object.entries(settings).map(([id, value]) => ({ id, name: id, ...value })));
  const clouds = [userCloud, reviewCloud, timelineCloud, branchCloud];
  const syncError = session.error || daily.error || clouds.find(cloud => cloud.error)?.error || null;
  const syncStatus = !session.account ? 'تسجيل الدخول مطلوب' : syncError ? 'تعذرت المزامنة' : clouds.some(cloud => cloud.pending > 0) ? 'جارٍ حفظ التعديلات…' : clouds.every(cloud => cloud.ready) ? 'متصل بـ Supabase' : 'جارٍ تحميل البيانات…';
  React.useEffect(() => {
    for (const key of ['app_windsor_api_url','app_windsor_api_url_2','app_windsor_branch_mapping','app_verified_windsor_import_report']) {
      try { localStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
    }
    try { indexedDB.deleteDatabase('rev4-read-cache-v1'); } catch { /* The new cache is isolated. */ }
  }, []);

  const { updateUser, addUser, setEmployeeDisabled, transferEmployee, mergeEmployees } = createEmployeeActions({
    users, setUsers, session, summaryReady: daily.ready, branchSettings, client: supabase,
    invalidate: () => invalidateRows(readNamespace(session)), notify: message => window.alert(message),
  });
  const updateBranchSettings = (branch: string, start: string, end: string, googleApi?: string, nextDayTime?: string) => {
    const current = branchSettings[branch] || {};
    setBranchSettings({ ...branchSettings, [branch]: { start, end,
      googleApi: googleApi !== undefined ? googleApi : current.googleApi,
      nextDayTime: nextDayTime !== undefined ? nextDayTime : current.nextDayTime } });
  };
  const { addTimelineComment, addTimelineEvent, updateTimelineEvent, acceptShiftRequest, deleteTimelineEvent, commitShifts } = createTimelineActions({
    timeline, setTimeline, scope: timelineScope, ready: timelineCloud.ready, notify: message => window.alert(message),
  });
  const { undoBatch, updateReview, deleteReview, parseReviewsText, commitReviews, clearData } = createReviewActions({
    reviews, timeline, setReviews, setTimeline, reviewScope, timelineScope,
    reviewReady: reviewCloud.ready, timelineReady: timelineCloud.ready, deleteTimelineEvent, notify: message => window.alert(message),
  });

  const enrichedUsers = React.useMemo(() => enrichEmployees(users, reviewSignals.rows, noteSignals.rows, resultsDate,
    Boolean(daily.data), employeeImg), [users, reviewSignals.rows, noteSignals.rows, resultsDate, daily.data]);

  const disabledIds = new Set(daily.data?.disabledEmployeeIds || []);
  const activeUsers = enrichedUsers.filter(user => !disabledIds.has(user.id));
  const disabledEmployees = session.account?.role === 'admin' ? enrichedUsers.filter(user => disabledIds.has(user.id)) : [];
  const featureState = React.useMemo(() => {
    const disabled = new Set(daily.data?.disabledEmployeeIds || []);
    const state = comparisonFromRecords(daily.data?.features || null, enrichedUsers.filter(user => user.role === 'employee' && !disabled.has(user.id)), reviewSignals.rows, resultsDate);
    if (!state?.store) return state;
    return { ...state, store: { ...state.store, collections: state.store.collections.map(collection => ({
      ...collection, variants: collection.variants.map(variant => variant.ownerId && disabled.has(variant.ownerId) ? { ...variant, ownerName: null } : variant),
    })) } };
  }, [daily.data, enrichedUsers, reviewSignals.rows, resultsDate]);

  // Historical imports are server-side maintenance operations; never republish embedded data.
  const resetUsersToRoster = () => { window.alert('تتم إدارة الاستيراد التاريخي من أداة الإدارة الآمنة خارج المتصفح'); };
  const resetTimelineToInjectedShifts = resetUsersToRoster;
  const resetReviewsToInjected = resetUsersToRoster;

  const sanitizedReviews = React.useMemo(() => {
    return (resultsMode ? recordsThroughDate(reviews, resultsDate) : reviews).map(r => ({ ...r, comment: stripReviewTranslation(r.comment) }));
  }, [reviews, resultsMode, resultsDate]);
  // Keep complete cloud rows for writes; the cutoff only changes the displayed projection.
  const displayedTimeline = React.useMemo(() => resultsMode ? recordsThroughDate(timeline, resultsDate) : timeline, [timeline, resultsMode, resultsDate]);

  return (
    <DataContext.Provider value={{
      resultsMode, resultsDate, setResultsMode,
      coverageBranchError: coverageBranches.error, coverageBranches: coverageBranches.branches,
      features: featureState,
      requestRecords,
      users: activeUsers, disabledEmployees, updateUser, addUser, setEmployeeDisabled, transferEmployee, mergeEmployees, branchSettings, updateBranchSettings,
      timeline: displayedTimeline, acceptShiftRequest, addTimelineComment, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent,
      reviews: sanitizedReviews, parseReviewsText, commitReviews, commitShifts, updateReview, deleteReview, undoBatch, clearData,
      resetUsersToRoster,
      resetTimelineToInjectedShifts,
      resetReviewsToInjected,
      seaApprovals, seaWinningBranches,
      rocketLaunchWinningBranches,
      sundayCoffeeWinningBranch,
      branchesWithReviewMilestone,
      reviewSummaries: reviewSignals.rows, recordsReady: (Boolean(reviewScope || timelineScope) || demands.some(d => d.users)) && userCloud.ready && reviewCloud.ready && timelineCloud.ready,
      summaryReady: Boolean(daily.data), summaryGeneratedAt: daily.data?.generatedAt || '', employeeHours: resultsMode ? {} : daily.data?.hours || {},
      currentAccount: session.account, authReady: session.ready, syncStatus, syncError
    }}>
      {children}
    </DataContext.Provider>
  );
};
