import React, { createContext, useContext, useState, useEffect } from 'react';
import { mockUsers } from '../lib/mockData';
import type { UserAccount } from '../lib/mockData';
import employeeImg from '../assets/employee.png';
import { toEnglishNumerals } from '../lib/formatDate';
import { fetchReviewsFromMake, normalizeMakeReviews } from '../lib/makeIntegration';

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
  users: UserAccount[];
  updateUser: (id: string, updates: Partial<UserAccount>) => void;
  addUser: (user: Omit<UserAccount, 'points' | 'reviewsCount'>) => void;
  removeUser: (id: string) => void;
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
  makeWebhookUrl: string;
  setMakeWebhookUrl: (url: string) => void;
  makeAutoSync: boolean;
  setMakeAutoSync: (enabled: boolean) => void;
  fetchAndProcessMakeReviews: (customUrl?: string) => Promise<{ success: boolean; count: number; error?: string }>;
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
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [branchSettings, setBranchSettings] = useState<Record<string, { start: string; end: string; googleApi?: string; nextDayTime?: string }>>({});
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [makeWebhookUrl, setMakeWebhookUrlState] = useState<string>(() => localStorage.getItem('app_make_webhook_url') || '');
  const [makeAutoSync, setMakeAutoSyncState] = useState<boolean>(() => localStorage.getItem('app_make_autosync') === 'true');

  useEffect(() => {
    // Load from local storage or fallback to mockData
    const savedUsers = localStorage.getItem('app_users_v5');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    } else {
      setUsers(mockUsers);
      safeStorageSet('app_users_v5', JSON.stringify(mockUsers));
    }

    const savedSettings = localStorage.getItem('app_branch_settings');
    if (savedSettings) {
      setBranchSettings(JSON.parse(savedSettings));
    } else {
      const defaultSettings: Record<string, { start: string; end: string; googleApi?: string }> = {};
      // Initialize default settings for known branches
      ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'].forEach(b => {
        defaultSettings[b] = { start: '16:00', end: '00:00', googleApi: '' };
      });
      setBranchSettings(defaultSettings);
      safeStorageSet('app_branch_settings', JSON.stringify(defaultSettings));
    }

    const savedTimeline = localStorage.getItem('app_timeline');
    if (savedTimeline) {
      setTimeline(JSON.parse(savedTimeline));
    } else {
      // Mock initial timeline
      const initialTimeline: TimelineEvent[] = [
        { id: '1', branch: 'جاليري', type: 'gap', title: 'فترة غير مغطاة', time: '14:00 - 16:00', comment: '' },
        { id: '2', branch: 'ذافيو', type: 'shift', title: 'تم بدء شفت مسائي', time: '16:00' },
      ];
      setTimeline(initialTimeline);
      safeStorageSet('app_timeline', initialTimeline);
    }

    const savedReviews = localStorage.getItem('app_reviews');
    if (savedReviews) {
      setReviews(JSON.parse(savedReviews));
    } else {
      safeStorageSet('app_reviews', []);
    }
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
    const newTimeline = [{ ...event, id: Date.now().toString() }, ...timeline];
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
    const userWithDefaults: UserAccount = { ...newUser, points: 0, reviewsCount: 0 };
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

  const updateReview = (id: string, updates: Partial<CustomerReview>) => {
    const newReviews = reviews.map(r => r.id === id ? { ...r, ...updates } : r);
    setReviews(newReviews);
    // Storage now handled by useEffect
  };

  const deleteReview = (id: string) => {
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
    setTimeline(prev => {
      let finalShifts = batchId ? shifts.map(s => ({ ...s, batchId })) : shifts;
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
    return users.map(user => {
      // Force all users to use the unified employee image
      const unifiedUser = { ...user, imageUrl: employeeImg };
      if (unifiedUser.role !== 'employee') return unifiedUser;
      
      const empReviews = reviews.filter(r => r.linkedEmployeeIds.includes(unifiedUser.id) || r.linkedEmployeeIds.includes(unifiedUser.name));
      const empTimeline = timeline.filter(t => t.employees?.some(e => e.id === unifiedUser.id || e.name === unifiedUser.name));
      
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      
      const currentMonthReviews = empReviews.filter(r => {
         const parts = r.date.split('-');
         if (parts.length >= 3) {
            return parseInt(toEnglishNumerals(parts[1]), 10) === currentMonth && parseInt(toEnglishNumerals(parts[2]), 10) === currentYear;
         }
         return false;
      });
      
      const currentMonthTimeline = empTimeline.filter(t => {
         if (!t.date) return false;
         const parts = t.date.split('-');
         if (parts.length >= 3) {
            return parseInt(toEnglishNumerals(parts[1]), 10) === currentMonth && parseInt(toEnglishNumerals(parts[2]), 10) === currentYear;
         }
         return false;
      });
      
      let positiveScore = 0;
      let negativeScore = 2; // base score for negative
      let complaintsScore = 0;
      let safetyScore = 0;
      
      currentMonthReviews.forEach(r => {
        const rating = parseInt(toEnglishNumerals(r.rating)) || 0;
        const shareCount = r.linkedEmployeeIds.length || 1;
        if (rating >= 4) {
          positiveScore += (0.25 / shareCount);
        } else {
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

      if (positiveScore > 5) positiveScore = 5;
      if (negativeScore < 0) negativeScore = 0;
      
      let qualityScore = 4 - (complaintsScore + safetyScore);
      if (qualityScore < 0) qualityScore = 0;
      
      const calculatedPoints = positiveScore + negativeScore + qualityScore;
      
      const totalReviewsCount = empReviews.length + (manual.totalReviews || 0);
      const monthReviewsCount = currentMonthReviews.length + (manual.monthReviews || 0);

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
  }, [users, reviews, timeline]);

  const clearData = (branch?: string, startDate?: string, endDate?: string) => {
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

  const setMakeWebhookUrl = (url: string) => {
    setMakeWebhookUrlState(url);
    safeStorageSet('app_make_webhook_url', url);
  };

  const setMakeAutoSync = (enabled: boolean) => {
    setMakeAutoSyncState(enabled);
    safeStorageSet('app_make_autosync', enabled ? 'true' : 'false');
  };

  const fetchAndProcessMakeReviews = async (customUrl?: string): Promise<{ success: boolean; count: number; error?: string }> => {
    const targetUrl = customUrl || makeWebhookUrl;
    if (!targetUrl || !targetUrl.trim()) {
      return { success: false, count: 0, error: 'رابط Webhook لـ Make.com غير محدد' };
    }

    try {
      const rawData = await fetchReviewsFromMake(targetUrl);
      const normalized = normalizeMakeReviews(rawData);

      if (normalized.length === 0) {
        return { success: true, count: 0 };
      }

      const batchId = `make_${Date.now()}`;
      const newReviews: CustomerReview[] = [];
      const newTimelineEvents: TimelineEvent[] = [];

      normalized.forEach(normReview => {
        const exists = reviews.some(r => r.id === normReview.id || (r.reviewerName === normReview.reviewerName && r.date === normReview.date && r.time === normReview.time));
        if (exists) return;

        let linkedEmployees: { id: string; name: string }[] = [];
        const rTime = parseInt(toEnglishNumerals(normReview.time).replace(':', ''), 10) || 0;

        let bestShift: TimelineEvent | null = null;
        let maxTime = -1;

        for (const s of timeline) {
          if (s.branch === normReview.branch && (s.type === 'shift' || !s.type)) {
            if (s.date && normReview.date && s.date !== normReview.date) continue;

            const sTime = parseInt(toEnglishNumerals(s.time).replace(':', ''), 10) || 0;
            if (sTime <= rTime && sTime > maxTime) {
              maxTime = sTime;
              bestShift = s;
            }
          }
        }

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
          title: `تقييم Make.com (${normReview.rating})`,
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
      console.error('Failed to fetch from Make.com', e);
      return { success: false, count: 0, error: e?.message || 'تعذر الاتصال بـ Make.com' };
    }
  };

  useEffect(() => {
    if (!makeAutoSync || !makeWebhookUrl) return;
    const interval = setInterval(() => {
      fetchAndProcessMakeReviews();
    }, 10 * 60 * 1000); // Check every 10 minutes
    return () => clearInterval(interval);
  }, [makeAutoSync, makeWebhookUrl, reviews, timeline]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (users.length > 0) safeStorageSet('app_users_v5', users);
    }, 500);
    return () => clearTimeout(t);
  }, [users]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (Object.keys(branchSettings).length > 0) safeStorageSet('app_branch_settings', branchSettings);
    }, 500);
    return () => clearTimeout(t);
  }, [branchSettings]);

  useEffect(() => {
    const t = setTimeout(() => safeStorageSet('app_timeline', timeline), 500);
    return () => clearTimeout(t);
  }, [timeline]);

  useEffect(() => {
    const t = setTimeout(() => safeStorageSet('app_reviews', reviews), 500);
    return () => clearTimeout(t);
  }, [reviews]);

  return (
    <DataContext.Provider value={{ 
      users: enrichedUsers, updateUser, addUser, removeUser, branchSettings, updateBranchSettings, 
      timeline, addTimelineComment, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent,
      reviews, parseReviewsText, commitReviews, commitShifts, updateReview, deleteReview, undoBatch, clearData,
      makeWebhookUrl, setMakeWebhookUrl, makeAutoSync, setMakeAutoSync, fetchAndProcessMakeReviews
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
