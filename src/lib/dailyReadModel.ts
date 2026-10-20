import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { APP_PATH, db } from './firebase';
import { boundedRead } from './cloudSync';
import type { DocumentSnapshot } from 'firebase/firestore';
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
const cache = new Map<string, Promise<DailyReadModel>>();
export function useDailyReadModel(session: CloudSession) {
  const [value, setValue] = useState<{ uid: string; data: DailyReadModel } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = session.account ? session.uid : null;
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const cacheKey = `${uid}:${day}`;
  useEffect(() => {
    if (!uid) return;
    let active = true;
    setError(null);
    let promise = cache.get(cacheKey);
    if (!promise) {
      promise = new Promise<DailyReadModel>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 15000);
        void boundedRead<DocumentSnapshot>((next, error) => onSnapshot(doc(db, APP_PATH), { includeMetadataChanges: true }, next, error)).then(snapshot => {
          const model = snapshot.data()?.dailyReadModel;
          if (!snapshot.exists() || !model || model.version !== 1) throw new Error('missing-summary');
          resolve({ generatedAt: model.generatedAt, directory: model.directory,
            reviews: model.reviews.map((r: any) => ({ id: r.i, branch: r.b, rating: r.r, date: r.d, time: r.t, linkedEmployeeIds: r.e })),
            notes: model.notes, hours: model.hours });
        }).catch(reject).finally(() => clearTimeout(timer));
      });
      cache.set(cacheKey, promise);
      void promise.catch(() => cache.delete(cacheKey));
    }
    void promise.then(data => { if (active) setValue({ uid, data }); }).catch(() => { if (active) setError('تعذر تحميل الملخص اليومي. تحققي من الاتصال ثم أعيدي فتح الصفحة.'); });
    return () => { active = false; };
  }, [uid, cacheKey]);
  return { data: uid && value?.uid === uid ? value.data : null, ready: !uid || value?.uid === uid, error: uid ? error : null };
}
