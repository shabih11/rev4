import type { Dispatch, SetStateAction } from 'react';
import type { CustomerReview, TimelineEvent } from '../context/DataContext';
import type { RecordScope } from './cloudReadPlan';
import { toEnglishNumerals } from './formatDate';

export function createReviewActions({ reviews, timeline, setReviews, setTimeline, reviewScope, timelineScope, reviewReady, timelineReady, deleteTimelineEvent, notify }: {
  reviews: CustomerReview[];
  timeline: TimelineEvent[];
  setReviews: Dispatch<SetStateAction<CustomerReview[]>>;
  setTimeline: Dispatch<SetStateAction<TimelineEvent[]>>;
  reviewScope: RecordScope | null;
  timelineScope: RecordScope | null;
  reviewReady: boolean;
  timelineReady: boolean;
  deleteTimelineEvent: (id: string) => void;
  notify: (message: string) => void;
}) {
  const undoBatch = (batchId: string) => {
    const newTimeline = timeline.filter(t => t.batchId !== batchId);
    setTimeline(newTimeline);

    const newReviews = reviews.filter(r => r.batchId !== batchId);
    setReviews(newReviews);
  };

  const updateReview = (id: string, updates: Partial<CustomerReview>) => {
    const newReviews = reviews.map(r => r.id === id ? { ...r, ...updates } : r);
    setReviews(newReviews);
  };

  const deleteReview = (id: string) => {
    if (!reviewScope || !timelineScope || !reviewReady || !timelineReady) {
      notify('انتظري اكتمال تحميل التقييمات والشفتات قبل الحذف');
      return;
    }
    const newReviews = reviews.filter(r => r.id !== id);
    setReviews(newReviews);
    deleteTimelineEvent(id);
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

  const clearData = (branch?: string, startDate?: string, endDate?: string) => {
    if (!reviewScope?.all || !timelineScope?.all || !reviewReady || !timelineReady) {
      notify('انتظري اكتمال تحميل جميع السجلات قبل المسح');
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

  return { undoBatch, updateReview, deleteReview, parseReviewsText, commitReviews, clearData };
}
