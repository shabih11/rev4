import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { APP_PATH, db } from './firebase';
import { fallbackRevision, getStoredRows, readNamespace, storeRows } from './browserReadCache';
import type { CloudSession } from './cloudSync';
import type { UserAccount } from './mockData';
import type { ReviewSummary, TimelineEvent } from '../context/DataContext';
export interface DailyReadModel {
  generatedAt: string;
  directory: UserAccount[];
  reviews: ReviewSummary[];
  notes: TimelineEvent[];
  hours: Record<string, number>;
}
export function useDailyReadModel(session: CloudSession) {
  const uid = session.account ? session.uid : null;
  const namespace = readNamespace(session);
  const [value, setValue] = useState<{ namespace: string; data: DailyReadModel | null; ready: boolean; error: string | null } | null>(null);
  const [cycle, setCycle] = useState(() => fallbackRevision());
  useEffect(() => {
    const tick = () => setCycle(fallbackRevision());
    const timer = setInterval(tick, 60_000);
    window.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => {
    if (!uid) return;
    let active = true, confirmed = false;
    const key = namespace + 'summary';
    void getStoredRows(key).then(rows => {
      if (active && !confirmed && rows?.[0]) setValue({ namespace, data: rows[0] as DailyReadModel, ready: true, error: null });
    });
    const timer = setTimeout(() => {
      if (active && !confirmed) setValue(previous => ({ namespace, data: previous?.namespace === namespace ? previous.data : null, ready: true, error: 'تعذر الاتصال بالملخص؛ تُعرض النسخة المحفوظة إن توفرت.' }));
    }, 15000);
    // One small automatic subscription; detail pages never start their own summary reads.
    const stop = onSnapshot(doc(db, APP_PATH), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      confirmed = true; clearTimeout(timer);
      const model = snapshot.data()?.dailyReadModel;
      const valid = model?.version === 1 && typeof model.generatedAt === 'string' && Array.isArray(model.directory) && Array.isArray(model.reviews) && Array.isArray(model.notes);
      const data: DailyReadModel | null = valid ? {
        generatedAt: model.generatedAt, directory: model.directory,
        reviews: model.reviews.map((r: any) => ({ id: r.i, branch: r.b, rating: r.r, date: r.d, time: r.t, linkedEmployeeIds: r.e })),
        notes: model.notes, hours: model.hours || {},
      } : null;
      if (import.meta.env.DEV) console.info('[firestore-read-audit]', JSON.stringify({ phase: 'summary-confirmed', source: 'dailyReadModel', documents: snapshot.exists() ? 1 : 0, summaryExists: Boolean(data) }));
      setValue({ namespace, data, ready: true, error: null });
      void storeRows(key, data ? [data] : []);
    }, () => {
      clearTimeout(timer);
      if (active) setValue({ namespace, data: null, ready: true, error: 'تعذر التحقق من صلاحية قراءة الملخص.' });
    });
    return () => { active = false; clearTimeout(timer); stop(); };
  }, [uid, namespace]);
  const current = uid && value?.namespace === namespace ? value : null;
  return { data: current?.data || null, ready: Boolean(current?.ready), error: current?.error || null,
    revision: current?.data?.generatedAt || cycle };
}
