import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where, writeBatch, deleteField, type QueryConstraint } from 'firebase/firestore';
import { APP_PATH, auth, db } from './firebase';
import type { UserAccount } from './mockData';

export interface CloudSession { account: UserAccount | null; ready: boolean; uid: string | null; error: string | null }
export async function cloudId(id: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function useCloudSession(): CloudSession {
  const [session, setSession] = useState<CloudSession>({ account: null, ready: false, uid: null, error: null });
  useEffect(() => {
    let revision = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const current = ++revision;
      if (!user) { setSession({ account: null, ready: true, uid: null, error: null }); return; }
      try {
        const access = await getDoc(doc(db, APP_PATH, 'access', user.uid));
        if (!access.exists()) throw new Error('هذا الحساب غير مخول لاستخدام التطبيق');
        const profile = await getDoc(doc(db, APP_PATH, 'users', access.data().profileDocId));
        if (!profile.exists()) throw new Error('لم يتم العثور على ملف الموظفة');
        if (current === revision) setSession({ account: profile.data() as UserAccount, ready: true, uid: user.uid, error: null });
      } catch {
        if (current === revision) setSession({ account: null, ready: true, uid: user.uid, error: 'تعذر تحميل صلاحيات الحساب. تواصلي مع الإدارة.' });
      }
    });
    return () => { revision++; unsubscribe(); };
  }, []);
  return session;
}
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
export function publicProfile(user: UserAccount) {
  const { email: _email, password: _password, mustChangePassword: _mustChangePassword, ...profile } = user as UserAccount & { password?: string };
  return clean(profile);
}
export function useCloudList<T extends { id: string }>(name: 'users' | 'reviews' | 'timeline' | 'branches' | 'reviewSignals' | 'noteSignals', session: CloudSession) {
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const latest = useRef<T[]>([]);
  const generation = useRef(0);
  useEffect(() => {
    const epoch = ++generation.current;
    latest.current = []; setRows([]); setReady(false); setError(null);
    if (!session.account) return;
    const role = session.account.role;
    const source = name === 'users' && role !== 'admin' ? 'profiles' : name;
    const constraints: QueryConstraint[] = [];
    if (role !== 'admin' && name === 'timeline') {
      if (role === 'manager') constraints.push(where('branch', '==', session.account.branch));
      else constraints.push(where('employeeIds', 'array-contains', session.account.id));
    }
    const sourceQuery = query(collection(db, APP_PATH, source), ...constraints);
    return onSnapshot(sourceQuery, { includeMetadataChanges: true }, snapshot => {
      if (epoch !== generation.current) return;
      let data = snapshot.docs.map(document => document.data() as T);
      if (name === 'users' && role !== 'admin') data = data.map(row => row.id === session.account!.id ? session.account as unknown as T : { email: '', ...row });
      latest.current = data; setRows(data); setReady(true); setError(null);
    }, () => { if (epoch === generation.current) { setError('تعذر الاتصال بقاعدة البيانات أو لا تتوفر صلاحية الوصول'); setReady(false); } });
  }, [name, session.account?.id, session.account?.role, session.account?.branch, session.uid]);

  const change = (action: React.SetStateAction<T[]>) => {
    if (!ready || !session.account) { setError('انتظري اكتمال تحميل البيانات قبل التعديل'); return; }
    const before = latest.current;
    const after = typeof action === 'function' ? action(before) : action;
    const previous = new Map(before.map(row => [row.id, row]));
    const next = new Map(after.map(row => [row.id, row]));
    const changed = [...next.values()].filter(row => JSON.stringify(row) !== JSON.stringify(previous.get(row.id)));
    const removed = [...previous.values()].filter(row => !next.has(row.id));
    if (!changed.length && !removed.length) return;
    const epoch = generation.current;
    setPending(p => p + 1); setError(null);
    // Firebase's local latency compensation emits pending and server-confirmed snapshots.
    void (async () => {
      const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
      for (const row of changed) {
        const id = await cloudId(row.id);
        let data = clean(row);
        if (name === 'users') { delete data.password; }
        if (name === 'timeline') {
          data.employeeIds = [...new Set((data.employees || []).map((e: { id: string }) => e.id))];
          if (session.account!.role === 'employee' && !previous.has(row.id)) {
            data.employeeIds = [session.account!.id];
            data.employees = [{ id: session.account!.id, name: session.account!.name }];
            data.branch = session.account!.branch;
            data.createdBy = session.uid;
          }
        }
        const old = previous.get(row.id);
        operations.push(batch => {
          const ref = doc(db, APP_PATH, name, id);
          if (!old) batch.set(ref, data);
          else {
            const patch: Record<string, unknown> = {};
            for (const key of new Set([...Object.keys(old), ...Object.keys(data)])) {
              if (JSON.stringify((old as Record<string, unknown>)[key]) !== JSON.stringify(data[key])) patch[key] = key in data ? data[key] : deleteField();
            }
            if (Object.keys(patch).length) batch.update(ref, patch);
          }
          if (name === 'reviews') { const { id, branch, rating, date, time, linkedEmployeeIds } = data; batch.set(doc(db, APP_PATH, 'reviewSignals', ref.id), { id, branch, rating, date, time, linkedEmployeeIds }); }
          if (name === 'timeline' && data.type === 'gap') { batch.set(doc(db, APP_PATH, 'noteSignals', ref.id), { id: data.id, branch: data.branch, date: data.date || '', type: 'gap', title: data.title.includes('شكوى') ? 'شكوى' : data.title.includes('سلامة') ? 'سلامة' : '', employees: (data.employees || []).map((employee: {id:string}) => ({id: employee.id, name: ''})) }); }
          if (name === 'users' && session.account!.role === 'admin') batch.set(doc(db, APP_PATH, 'profiles', id), publicProfile(data));
          if (name === 'timeline' && data.type === 'shift') batch.set(doc(db, APP_PATH, 'shifts', id), data);
        });
      }
      for (const row of removed) {
        const id = await cloudId(row.id);
        operations.push(batch => {
          batch.delete(doc(db, APP_PATH, name, id));
          if (name === 'reviews') batch.delete(doc(db, APP_PATH, 'reviewSignals', id));
          if (name === 'timeline' && (row as unknown as {type: string}).type === 'gap') batch.delete(doc(db, APP_PATH, 'noteSignals', id));
          if (name === 'users') batch.delete(doc(db, APP_PATH, 'profiles', id));
          if (name === 'timeline' && (row as unknown as {type: string}).type === 'shift') batch.delete(doc(db, APP_PATH, 'shifts', id));
        });
      }
      for (let offset = 0; offset < operations.length; offset += 100) {
        if (epoch !== generation.current) return;
        const batch = writeBatch(db);
        operations.slice(offset, offset + 100).forEach(operation => operation(batch));
        await batch.commit();
      }
    })().catch(() => { if (epoch === generation.current) setError('لم يُحفظ التعديل في Firebase. تحققي من الاتصال والصلاحيات وأعيدي المحاولة.'); })
      .finally(() => setPending(p => Math.max(0, p - 1)));
  };
  return { rows, change, ready, error, pending };
}
