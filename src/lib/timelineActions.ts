import type { Dispatch, SetStateAction } from 'react';
import type { TimelineEvent } from '../context/DataContext';
import type { RecordScope } from './cloudReadPlan';
import { normalizeFridayShift } from './shiftSchedule';
import { timeMinutes } from './formatDate';

export function createTimelineActions({ timeline, setTimeline, scope, ready, notify }: {
  timeline: TimelineEvent[];
  setTimeline: Dispatch<SetStateAction<TimelineEvent[]>>;
  scope: RecordScope | null;
  ready: boolean;
  notify: (message: string) => void;
}) {
  const addTimelineComment = (id: string, comment: string) => {
    const newTimeline = timeline.map(t => t.id === id ? { ...t, comment } : t);
    setTimeline(newTimeline);
  };

  const addTimelineEvent = (event: Omit<TimelineEvent, 'id'>) => {
    if (!scope || !ready) { notify('انتظري اكتمال تحميل الشفتات قبل الحفظ'); return; }
    // PostgreSQL validates the shift and links reviews in the same transaction.
    setTimeline(previous => [normalizeFridayShift({ ...event, id: crypto.randomUUID() }), ...previous]);
  };

  const updateTimelineEvent = (id: string, updates: Partial<TimelineEvent>) => {
    setTimeline(previous => previous.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const acceptShiftRequest = (id: string, time: string, endTime: string) => {
    const request = timeline.find(event => event.id === id && event.requestStatus === 'pending');
    if (!request?.date || !request.employees?.length || !ready) return;
    const first = request.requestedShift === 'first';
    const existing = timeline.find(event => event.type === 'shift' && event.branch === request.branch && event.date === request.date && ((timeMinutes(event.time) ?? 0) < 960) === first);
    const employees = [...(existing?.employees || [])];
    for (const employee of request.employees) if (!employees.some(item => item.id === employee.id)) employees.push(employee);
    const shift: TimelineEvent = existing ? { ...existing, employees } : { id: crypto.randomUUID(), branch: request.branch, type: 'shift', title: first ? 'الشفت الأول' : 'الشفت الثاني', date: request.date, time, endTime, employees };
    // write_rows and the existing relinking trigger save the decision, shift and review links atomically.
    setTimeline(previous => [normalizeFridayShift(shift), ...previous.filter(event => event.id !== shift.id).map(event => event.id === id ? { ...event, requestStatus: 'accepted' as const } : event)]);
  };

  const deleteTimelineEvent = (id: string) => {
    const newTimeline = timeline.filter(t => t.id !== id);
    setTimeline(newTimeline);
  };

  const commitShifts = (shifts: TimelineEvent[], batchId?: string) => {
    if (!ready) { notify('انتظري اكتمال تحميل الشفتات'); return; }
    setTimeline(previous => [...shifts.map(shift => normalizeFridayShift({ ...shift, batchId: batchId || shift.batchId })), ...previous]);
  };

  return { addTimelineComment, addTimelineEvent, updateTimelineEvent, acceptShiftRequest, deleteTimelineEvent, commitShifts };
}
