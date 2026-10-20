import { useDailyReadModel } from '../lib/dailyReadModel';
import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserAccount } from '../lib/mockData';
import employeeImg from '../assets/employee.png';
import { toEnglishNumerals } from '../lib/formatDate';
import { fetchReviewsFromWindsor, normalizeWindsorReviews, stripReviewTranslation } from '../lib/windsorIntegration';
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
  reviewId?: string;
  batchId?: string;
}

interface DataContextType {
  requestRecords: (id: string, demand: RecordDemand | null) => void;
  users: UserAccount[];
  updateUser: (id: string, updates: Partial<UserAccount>) => void;
  addUser: (user: Omit<UserAccount, 'points' | 'reviewsCount'>) => void;
  removeUser: (id: string) => void;
  convertToMobile: (id: string) => void;
  mergeEmployees: (primaryId: string, duplicateId: string, newName?: string, newBranch?: string) => void;
  branchSettings: Record<string, { start: string; end: string; googleApi?: string; nextDayTime?: string }>;
  updateBranchSettings: (branch: string, start: string, end: string, googleApi?: string, nextDayTime?: string) => void;
  timeline: TimelineEvent[];
  addTimelineComment: (id: string, comment: string) => void;
  addTimelineEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  updateTimelineEvent: (id: string, updates: Partial<TimelineEvent>) => void;
  deleteTimelineEvent: (id: string) => void;
  reviews: CustomerReview[];
  parseReviewsText: (branch: string, text: string, batchId?: string) => { reviews: CustomerReview[], timelineEvents: TimelineEvent[] };
  commitReviews: (newReviews: CustomerReview[], newTimelineEvents: TimelineEvent[]) => void;
  commitShifts: (shifts: TimelineEvent[], batchId?: string) => void;
  updateReview: (id: string, updates: Partial<CustomerReview>) => void;
  deleteReview: (id: string) => void;
  undoBatch: (batchId: string) => void;
  clearData: (branch?: string, startDate?: string, endDate?: string) => void;
  windsorBranchMapping: Record<string, string>;
  setWindsorBranchMapping: (mapping: Record<string, string>) => void;
  windsorApiUrl: string;
  setWindsorApiUrl: (url: string) => void;
  windsorApiUrl2: string;
  setWindsorApiUrl2: (url: string) => void;
  fetchAndProcessWindsorReviews: (customUrl?: string) => Promise<{ success: boolean; count: number; error?: string }>;
  resetUsersToRoster: () => void;
  resetTimelineToInjectedShifts: () => void;
  resetReviewsToInjected: () => void;
  reviewSummaries: ReviewSummary[];
  recordsReady: boolean;
  summaryReady: boolean;
  requestBasicSummary: () => void;
  summaryGeneratedAt: string;
  employeeHours: Record<string, number>;
  currentAccount: UserAccount | null;
  authReady: boolean;
  syncStatus: string;
  syncError: string | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const safeStorageSet = (key: string, value: any) => {
  try {
    const stringified = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, stringified);
  } catch (e) {
    console.error('Storage quota exceeded or error:', e);
  }
};

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
  const [legacyRequestUid, setLegacyRequestUid] = useState<string | null>(null);
  const legacyRequested = Boolean(session.uid && legacyRequestUid === session.uid);
  // Explicit temporary read path while the server's daily summary is not prepared.
  const legacyScope = legacyRequested && !daily.data ? { all: true } : null;
  const legacyDirectory = useCloudList<UserAccount>('profiles', session, legacyScope);
  const legacyReviews = useCloudList<ReviewSummary>('reviewSignals', session, legacyScope);
  const legacyNotes = useCloudList<TimelineEvent>('noteSignals', session, legacyScope);
  const legacyReady = legacyRequested && legacyDirectory.ready && legacyReviews.ready && legacyNotes.ready;
  const userCloud = useCloudList<UserAccount>('users', session, demands.some(d => d.users) ? { all: true } : null);
  const reviewCloud = useCloudList<CustomerReview>('reviews', session, reviewScope);
  const reviewSignals = { rows: daily.data?.reviews || legacyReviews.rows };
  const noteSignals = { rows: daily.data?.notes || legacyNotes.rows };
  const timelineCloud = useCloudList<TimelineEvent>('timeline', session, timelineScope);
  type BranchRecord = { id: string; name: string; start: string; end: string; googleApi?: string; nextDayTime?: string };
  const branchCloud = useCloudList<BranchRecord>('branches', session);
  const users = userCloud.rows.length ? userCloud.rows : (daily.data?.directory || legacyDirectory.rows).map(u => u.id === session.account?.id ? session.account : { ...u, email: '' });
  const setUsers = userCloud.change;
  const reviews = reviewCloud.rows, setReviews = reviewCloud.change;
  const timeline = timelineCloud.rows, setTimeline = timelineCloud.change;
  const branchSettings = React.useMemo(() => Object.fromEntries(branchCloud.rows.map(({ id, name: _name, ...settings }) => [id, settings])), [branchCloud.rows]);
  const setBranchSettings = (settings: typeof branchSettings) => branchCloud.change(Object.entries(settings).map(([id, value]) => ({ id, name: id, ...value })));
  const clouds = [userCloud, reviewCloud, timelineCloud, branchCloud, legacyDirectory, legacyReviews, legacyNotes];
  const syncError = session.error || (!legacyReady ? daily.error : null) || clouds.find(cloud => cloud.error)?.error || null;
  const syncStatus = !session.account ? 'تسجيل الدخول مطلوب' : syncError ? 'تعذرت المزامنة' : clouds.some(cloud => cloud.pending > 0) ? 'جارٍ حفظ التعديلات…' : clouds.every(cloud => cloud.ready) ? 'متصل بـ Firebase' : 'جارٍ تحميل البيانات…';
  const [windsorBranchMapping, setWindsorBranchMappingState] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('app_windsor_branch_mapping') || '{}'); } catch { return {}; }
  });
  const setWindsorBranchMapping = (mapping: Record<string, string>) => {
    setWindsorBranchMappingState(mapping);
    safeStorageSet('app_windsor_branch_mapping', mapping);
  };
  const [windsorApiUrl, setWindsorApiUrlState] = useState<string>(() => localStorage.getItem('app_windsor_api_url') || '');
  const [windsorApiUrl2, setWindsorApiUrl2State] = useState<string>(() => localStorage.getItem('app_windsor_api_url_2') || '');
  const windsorSyncInFlight = React.useRef(false);

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

  const isReviewInShift = (rDate: string, rTimeStr: string, sDate?: string, sStartTime?: string, sEndTime?: string) => {
    if (sDate && rDate && sDate !== rDate) return false;
    if (!sStartTime) return false;

    const rTime = parseInt(toEnglishNumerals(rTimeStr).replace(':', ''), 10) || 0;
    const sStart = parseInt(toEnglishNumerals(sStartTime).replace(':', ''), 10) || 0;
    const sEnd = parseInt(toEnglishNumerals(sEndTime || '23:59').replace(':', ''), 10) || 0;

    if (sEnd < sStart) {
      // Overnight shift (e.g. 16:00 to 01:00)
      return rTime >= sStart || rTime <= sEnd;
    } else {
      return rTime >= sStart && rTime <= sEnd;
    }
  };

  const addTimelineEvent = (event: Omit<TimelineEvent, 'id'>) => {
    if (!timelineScope || !timelineCloud.ready || (event.type === 'shift' && (!reviewScope || !reviewCloud.ready))) {
      window.alert('انتظري اكتمال تحميل التقييمات والشفتات قبل الحفظ');
      return;
    }
    const newId = Date.now().toString();
    const newShift: TimelineEvent = { ...event, id: newId };

    // إذا كان الحدث عبارة عن شفت جديد ويحتوي على موظفات، نقوم بربط جميع التقييمات المتطابقة بالموظفات
    if (newShift.type === 'shift' && newShift.employees && newShift.employees.length > 0) {
      const empIds = newShift.employees.map(e => e.id);

      setReviews(prevReviews => {
        let changed = false;
        const updated = prevReviews.map(r => {
          if (r.branch === newShift.branch && isReviewInShift(r.date, r.time, newShift.date, newShift.time, newShift.endTime)) {
            changed = true;
            return {
              ...r,
              linkedEmployeeIds: empIds,
              linkedShiftId: newId
            };
          }
          return r;
        });
        return changed ? updated : prevReviews;
      });

      // وتحديث أي أحداث تقييم موجودة في الـ timeline لنفس الفرع والوقت
      setTimeline(prevTimeline => {
        const updatedTimeline = prevTimeline.map(t => {
          if (t.type === 'review' && t.branch === newShift.branch && isReviewInShift(t.date || '', t.time, newShift.date, newShift.time, newShift.endTime)) {
            return {
              ...t,
              employees: newShift.employees
            };
          }
          return t;
        });
        return [newShift, ...updatedTimeline];
      });
      return;
    }

    const newTimeline = [newShift, ...timeline];
    setTimeline(newTimeline);
    try { /* Storage now handled by useEffect */ } catch (e) { console.error(e); }
  };

  const updateTimelineEvent = (id: string, updates: Partial<TimelineEvent>) => {
    const newTimeline = timeline.map(t => t.id === id ? { ...t, ...updates } : t);
    setTimeline(newTimeline);
    // Storage now handled by useEffect
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

  const removeUser = (id: string) => {
    const newUsers = users.filter(u => u.id !== id);
    setUsers(newUsers);
    try {
      // Storage now handled by useEffect
    } catch (e) { console.error(e); }
  };

  const convertToMobile = (id: string) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    updateUser(id, {
      branch: 'موظفة خارجية',
      assignedBranches: Array.from(new Set([...(target.assignedBranches || []), target.branch])),
    });
  };

  const mergeEmployees = (primaryId: string, duplicateId: string, newName?: string, newBranch?: string) => {
    if (!userCloud.ready || !reviewCloud.ready || !timelineCloud.ready || !reviewScope?.all || !timelineScope?.all) {
      window.alert('انتظري اكتمال تحميل السجلات قبل دمج الموظفات');
      return;
    }
    const emp1 = users.find(u => u.id === primaryId);
    const emp2 = users.find(u => u.id === duplicateId);
    if (!emp1 || !emp2 || primaryId === duplicateId) return;

    const finalName = newName?.trim() || emp1.name;
    const finalBranch = newBranch || emp1.branch;

    const combinedAliases = Array.from(new Set([
      ...(emp1.aliases || []),
      ...(emp2.aliases || []),
      emp1.name,
      emp2.name,
    ])).filter(a => a && a !== finalName);

    const combinedBranches = Array.from(new Set([
      ...(emp1.assignedBranches || []),
      ...(emp2.assignedBranches || []),
      emp1.branch,
      emp2.branch,
    ]));

    const manual1 = emp1.manualStats || {};
    const manual2 = emp2.manualStats || {};
    const combinedManual = {
      positive: (manual1.positive || 0) + (manual2.positive || 0),
      negative: (manual1.negative || 0) + (manual2.negative || 0),
      complaints: (manual1.complaints || 0) + (manual2.complaints || 0),
      safety: (manual1.safety || 0) + (manual2.safety || 0),
      totalReviews: (manual1.totalReviews || 0) + (manual2.totalReviews || 0),
      monthReviews: (manual1.monthReviews || 0) + (manual2.monthReviews || 0),
    };

    // 1. Update primary and remove duplicate
    setUsers(prev => prev.filter(u => u.id !== duplicateId).map(u => {
      if (u.id === primaryId) {
        return {
          ...u,
          name: finalName,
          branch: finalBranch,
          aliases: combinedAliases,
          assignedBranches: combinedBranches,
          manualStats: combinedManual,
        };
      }
      return u;
    }));

    // 2. Transfer all reviews linked to duplicateId or emp2.name to primaryId
    setReviews(prev => prev.map(r => {
      const hasDuplicate = r.linkedEmployeeIds.includes(duplicateId) || r.linkedEmployeeIds.includes(emp2.name);
      if (!hasDuplicate) return r;
      const updatedIds = Array.from(new Set(
        r.linkedEmployeeIds.map(id => (id === duplicateId || id === emp2.name) ? primaryId : id)
      ));
      return {
        ...r,
        linkedEmployeeIds: updatedIds,
      };
    }));

    // 3. Transfer all shifts & timeline events
    setTimeline(prev => prev.map(t => {
      if (!t.employees || t.employees.length === 0) return t;
      const hasDuplicate = t.employees.some(e => e.id === duplicateId || e.name === emp2.name);
      if (!hasDuplicate) return t;
      const updatedEmployees: { id: string; name: string }[] = [];
      const seenIds = new Set<string>();
      for (const e of t.employees) {
        const isDup = e.id === duplicateId || e.name === emp2.name;
        const targetId = isDup ? primaryId : e.id;
        const targetName = isDup ? finalName : e.name;
        if (!seenIds.has(targetId)) {
          seenIds.add(targetId);
          updatedEmployees.push({ id: targetId, name: targetName });
        }
      }
      return {
        ...t,
        employees: updatedEmployees,
      };
    }));
  };

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

          let linkedEmployees: {id: string, name: string}[] = [];
          const rTime = parseInt(toEnglishNumerals(newReview.time).replace(':', ''));
          const possibleShifts = timeline.filter(t => t.branch === branch && t.type === 'shift' && t.employees && t.employees.length > 0);
          
          let bestShift: TimelineEvent | null = null;
          for (const s of possibleShifts) {
            const sTime = parseInt(toEnglishNumerals(s.time).replace(':', ''));
            const eTimeStr = s.endTime || '23:59';
            const eTime = parseInt(toEnglishNumerals(eTimeStr).replace(':', ''));
            
            if (eTime < sTime) {
              if (rTime >= sTime || rTime <= eTime) { bestShift = s; break; }
            } else {
              if (rTime >= sTime && rTime <= eTime) { bestShift = s; break; }
            }
          }

          if (!bestShift) {
            let maxTime = -1;
            for (const s of possibleShifts) {
              const sTime = parseInt(toEnglishNumerals(s.time).replace(':', ''));
              if (sTime <= rTime && sTime > maxTime) {
                maxTime = sTime;
                bestShift = s;
              }
            }
          }

          if (bestShift && bestShift.employees) {
            linkedEmployees = bestShift.employees;
            newReview.linkedEmployeeIds = linkedEmployees.map(e => e.id);
            newReview.linkedShiftId = bestShift.id;
          }

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

  const commitReviews = (newReviews: CustomerReview[], newTimelineEvents: TimelineEvent[]) => {
    setReviews(prev => {
      const updated = [...newReviews, ...prev];
      return updated;
    });

    if (newTimelineEvents.length > 0) {
      setTimeline(prevT => {
        const updatedT = [...newTimelineEvents, ...prevT].sort((a, b) => {
           const aTime = parseInt(toEnglishNumerals(a.time).replace(':', '')) || 0;
           const bTime = parseInt(toEnglishNumerals(b.time).replace(':', '')) || 0;
           return bTime - aTime;
        });
        return updatedT;
      });
    }
  };

  const commitShifts = (shifts: TimelineEvent[], batchId?: string) => {
    if (!reviewScope || !timelineScope || !reviewCloud.ready || !timelineCloud.ready) {
      window.alert('انتظري اكتمال تحميل التقييمات والشفتات قبل الحفظ');
      return;
    }
    let finalShifts = batchId ? shifts.map(s => ({ ...s, batchId })) : shifts;

    // فحص وربط جميع التقييمات السابقة بالشفتات الجديدة
    setReviews(prevReviews => {
      let changed = false;
      const updated = prevReviews.map(r => {
        // البحث عن أفضل شفت يطابق هذا التقييم
        const matchingShift = finalShifts.find(s => s.branch === r.branch && isReviewInShift(r.date, r.time, s.date, s.time, s.endTime) && s.employees && s.employees.length > 0);
        if (matchingShift && matchingShift.employees) {
          changed = true;
          return {
            ...r,
            linkedEmployeeIds: matchingShift.employees.map(e => e.id),
            linkedShiftId: matchingShift.id
          };
        }
        return r;
      });
      return changed ? updated : prevReviews;
    });

    setTimeline(prev => {
      let newTimeline = [...prev, ...finalShifts];
      newTimeline.sort((a, b) => {
         const aTime = parseInt(toEnglishNumerals(a.time).replace(':', '')) || 0;
         const bTime = parseInt(toEnglishNumerals(b.time).replace(':', '')) || 0;
         return bTime - aTime;
      });
      return newTimeline;
    });
  };

  const enrichedUsers = React.useMemo(() => {
    if (!daily.data && !legacyReady) return users.map(user => ({ ...user, imageUrl: employeeImg }));
    return users.map(user => {
      // Force all users to use the unified employee image
      const unifiedUser = { ...user, imageUrl: employeeImg };
      if (unifiedUser.role !== 'employee') return unifiedUser;
      
      const empReviews = reviewSignals.rows.filter(r => r.linkedEmployeeIds.includes(unifiedUser.id) || r.linkedEmployeeIds.includes(unifiedUser.name));
      const empTimeline = noteSignals.rows.filter(t => t.employees?.some(e => e.id === unifiedUser.id || e.name === unifiedUser.name));
      
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
  }, [users, reviewSignals.rows, noteSignals.rows, daily.data, legacyReady]);

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

  const setWindsorApiUrl = (url: string) => {
    setWindsorApiUrlState(url);
    safeStorageSet('app_windsor_api_url', url);
  };

  const setWindsorApiUrl2 = (url: string) => {
    setWindsorApiUrl2State(url);
    safeStorageSet('app_windsor_api_url_2', url);
  };

  const fetchAndProcessWindsorReviews = async (customUrl?: string): Promise<{ success: boolean; count: number; error?: string }> => {
    if (!reviewScope?.all || !timelineScope?.all || !reviewCloud.ready || !timelineCloud.ready) {
      return { success: false, count: 0, error: 'انتظري اكتمال تحميل التقييمات والشفتات قبل الاستيراد' };
    }
    const urls = customUrl ? [customUrl] : [windsorApiUrl, windsorApiUrl2].filter(u => u && u.trim());
    if (urls.length === 0) {
      return { success: false, count: 0, error: 'لم يتم تحديد أي رابط API لـ Windsor.ai' };
    }
    if (windsorSyncInFlight.current) return { success: true, count: 0 };
    windsorSyncInFlight.current = true;

    try {
      const results = await Promise.allSettled(urls.map(url => fetchReviewsFromWindsor(url)));
      let allRawData: any[] = [];
      const errorMessages: string[] = [];

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          if (Array.isArray(res.value)) {
            allRawData = allRawData.concat(res.value);
          } else {
            allRawData.push(res.value);
          }
        } else {
          errorMessages.push(`رابط ${idx + 1}: ${res.reason instanceof Error ? res.reason.message : 'فشل الاتصال بـ Windsor.ai'}`);
        }
      });

      if (errorMessages.length > 0) {
        return { success: false, count: 0, error: errorMessages.join(' | ') };
      }

      const normalized = normalizeWindsorReviews(allRawData, windsorBranchMapping);

      if (normalized.length === 0) {
        return { success: true, count: 0 };
      }

      const batchId = `windsor_${Date.now()}`;
      const newReviews: CustomerReview[] = [];
      const newTimelineEvents: TimelineEvent[] = [];

      normalized.forEach(normReview => {
        const exists = reviews.some(r => r.id === normReview.id);
        if (exists || newReviews.some(r => r.id === normReview.id)) return;

        let linkedEmployees: { id: string; name: string }[] = [];
        const reviewDateTime = (date: string, time: string) => {
          const [day, month, year] = toEnglishNumerals(date).split('-').map(Number);
          const [hour, minute] = toEnglishNumerals(time).split(':').map(Number);
          return new Date(year, month - 1, day, hour, minute).getTime();
        };
        const reviewTime = reviewDateTime(normReview.date, normReview.time);
        const bestShift = timeline.filter(s => {
          if (s.type !== 'shift' || s.branch !== normReview.branch || !s.date || !s.employees?.length) return false;
          const start = reviewDateTime(s.date, s.time);
          let end = reviewDateTime(s.endDate || s.date, s.endTime || '23:59');
          if (!s.endDate && end < start) end += 24 * 60 * 60 * 1000;
          return reviewTime >= start && reviewTime <= end;
        }).sort((a, b) => reviewDateTime(b.date!, b.time) - reviewDateTime(a.date!, a.time))[0];

        if (bestShift && bestShift.employees) {
          linkedEmployees = bestShift.employees;
        }

        const reviewObj: CustomerReview = {
          ...normReview,
          linkedEmployeeIds: linkedEmployees.map(e => e.id),
          linkedShiftId: bestShift?.id,
          batchId
        };

        newReviews.push(reviewObj);

        newTimelineEvents.push({
          id: normReview.id,
          branch: normReview.branch,
          type: 'review',
          title: `تقييم Windsor.ai (${normReview.rating})`,
          time: normReview.time,
          date: normReview.date,
          comment: normReview.comment,
          employees: linkedEmployees,
          reviewId: normReview.id,
          batchId
        });
      });

      if (newReviews.length > 0) {
        commitReviews(newReviews, newTimelineEvents);
      }

      return { success: true, count: newReviews.length };
    } catch (e: any) {
      console.error('Failed to fetch from Windsor.ai', e);
      return { success: false, count: 0, error: e?.message || 'تعذر الاتصال بـ Windsor.ai' };
    } finally {
      windsorSyncInFlight.current = false;
    }
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
      requestRecords,
      users: enrichedUsers, updateUser, addUser, removeUser, convertToMobile, mergeEmployees, branchSettings, updateBranchSettings, 
      timeline, addTimelineComment, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent,
      reviews: sanitizedReviews, parseReviewsText, commitReviews, commitShifts, updateReview, deleteReview, undoBatch, clearData,
      windsorBranchMapping, setWindsorBranchMapping, windsorApiUrl, setWindsorApiUrl, windsorApiUrl2, setWindsorApiUrl2, fetchAndProcessWindsorReviews,
      resetUsersToRoster,
      resetTimelineToInjectedShifts,
      resetReviewsToInjected,
      reviewSummaries: reviewSignals.rows, recordsReady: (Boolean(reviewScope || timelineScope) || demands.some(d => d.users)) && userCloud.ready && reviewCloud.ready && timelineCloud.ready,
      summaryReady: Boolean(daily.data) || legacyReady, requestBasicSummary: () => setLegacyRequestUid(session.uid), summaryGeneratedAt: daily.data?.generatedAt || '', employeeHours: daily.data?.hours || {},
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
