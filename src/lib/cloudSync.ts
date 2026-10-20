import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where, or, runTransaction, deleteField } from 'firebase/firestore';
import type { QuerySnapshot, DocumentSnapshot, DocumentReference, Transaction } from 'firebase/firestore';
import { APP_PATH, auth, db } from './firebase';
import type { UserAccount } from './mockData';
import { cachedRows, invalidateRows, readNamespace, stableJSON } from './browserReadCache';
import { recordFilters, type RecordScope } from './cloudReadPlan';

let readAuditSequence = 0;
type ReadAudit = { source: string; scope?: 'document' | 'all' | 'employee' | 'branch' | 'mixed' };
// Development-only metadata: never log query values, document IDs, or contents.
const readAudit = (data: Record<string, unknown>) => {
  if (import.meta.env?.DEV) console.info('[firestore-read-audit]', JSON.stringify(data));
};

// Each network read closes its listener on confirmation, error, or deadline.
export function boundedRead<T extends { metadata: { fromCache: boolean; hasPendingWrites?: boolean } }>(listen: (next: (value: T) => void, error: (reason: unknown) => void) => () => void, audit?: ReadAudit): Promise<T> {
  return new Promise((resolve, reject) => {
    const auditId = ++readAuditSequence;
    const started = Date.now();
    if (audit) readAudit({ id: auditId, phase: 'start', ...audit });
    let stop: (() => void) | undefined;
    let finished = false;
    const finish = (value?: T, error?: unknown) => {
      if (finished) return;
      finished = true; clearTimeout(timer); stop?.();
      if (audit) {
        const snapshot = value as (T & { size?: number; exists?: () => boolean }) | undefined;
        const documents = snapshot ? (typeof snapshot.size === 'number' ? snapshot.size : snapshot.exists?.() ? 1 : 0) : 0;
        readAudit({ id: auditId, phase: value ? 'confirmed' : 'failed', ...audit, documents,
          minimumDocumentReads: value ? Math.max(1, documents) : null, elapsedMs: Date.now() - started });
      }
      if (value) resolve(value); else reject(error);
    };
    const timer = setTimeout(() => finish(undefined, new Error('read-timeout')), 15000);
    try {
      stop = listen(value => { if (!value.metadata.fromCache && !value.metadata.hasPendingWrites) finish(value); }, error => finish(undefined, error));
      if (finished) stop();
    } catch (error) { finish(undefined, error); }
  });
}


export interface CloudSession { account: UserAccount | null; ready: boolean; uid: string | null; error: string | null; dataVersion?: string }
export async function cloudId(id: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function useCloudSession(): CloudSession {
  const [session, setSession] = useState<CloudSession>({ account: null, ready: false, uid: null, error: null });
  useEffect(() => {
    let revision = 0, profileRevision = 0;
    let lastNamespace = '';
    let stopAccess: (() => void) | undefined;
    let accessTimer: ReturnType<typeof setTimeout> | undefined;
    const purge = () => { if (lastNamespace) { void invalidateRows(lastNamespace); lastNamespace = ''; } };
    const unsubscribe = onAuthStateChanged(auth, user => {
      const current = ++revision;
      profileRevision++;
      stopAccess?.(); clearTimeout(accessTimer);
      if (!user) { purge(); setSession({ account: null, ready: true, uid: null, error: null }); return; }
      setSession({ account: null, ready: false, uid: user.uid, error: null });
      let signature = '';
      const rejectSession = () => {
        if (current !== revision) return;
        profileRevision++; signature = ''; purge();
        setSession({ account: null, ready: true, uid: user.uid, error: 'تعذر التحقق من صلاحيات الحساب. تواصلي مع الإدارة.' });
      };
      accessTimer = setTimeout(rejectSession, 15000);
      // Keep this small permission document live so revocation also hides persisted data.
      stopAccess = onSnapshot(doc(db, APP_PATH, 'access', user.uid), { includeMetadataChanges: true }, access => {
        if (current !== revision || access.metadata.fromCache || access.metadata.hasPendingWrites) return;
        clearTimeout(accessTimer);
        readAudit({ phase: 'access-confirmed', source: 'access', documents: access.exists() ? 1 : 0 });
        if (!access.exists()) { rejectSession(); return; }
        const permissions = access.data();
        const nextSignature = stableJSON(permissions);
        if (nextSignature === signature) return;
        signature = nextSignature;
        const profileVersion = ++profileRevision;
        setSession({ account: null, ready: false, uid: user.uid, error: null });
        void boundedRead<DocumentSnapshot>((next, error) => onSnapshot(doc(db, APP_PATH, 'users', permissions.profileDocId), { includeMetadataChanges: true }, next, error), { source: 'users', scope: 'document' }).then(profile => {
          if (current !== revision || profileVersion !== profileRevision) return;
          if (!profile.exists() || !['admin', 'manager', 'employee'].includes(permissions.role) || typeof permissions.branch !== 'string') throw new Error('invalid-access');
          const data = profile.data() as UserAccount;
          if (permissions.employeeId && permissions.employeeId !== data.id) throw new Error('profile-mismatch');
          const account = { ...data, role: permissions.role, branch: permissions.branch } as UserAccount;
          const namespace = readNamespace({ uid: user.uid, account });
          if (lastNamespace && lastNamespace !== namespace) purge();
          lastNamespace = namespace;
          setSession({ account, ready: true, uid: user.uid, error: null });
        }).catch(() => { if (current === revision && profileVersion === profileRevision) rejectSession(); });
      }, rejectSession);
    });
    return () => { revision++; profileRevision++; clearTimeout(accessTimer); stopAccess?.(); unsubscribe(); };
  }, []);
  return session;
}
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
export function publicProfile(user: UserAccount) {
  const { email: _email, password: _password, mustChangePassword: _mustChangePassword, ...profile } = user as UserAccount & { password?: string; mustChangePassword?: boolean };
  return clean(profile);
}
const reviewSignal = (data: Record<string, any>) => {
  const { id, branch, rating, date, time, linkedEmployeeIds } = data;
  return { id, branch, rating, date, time, linkedEmployeeIds };
};
const noteSignal = (data: Record<string, any>) => ({
  id: data.id, branch: data.branch, date: data.date || '', type: 'gap',
  title: data.title.includes('شكوى') ? 'شكوى' : data.title.includes('سلامة') ? 'سلامة' : '',
  employees: (data.employees || []).map((employee: { id: string }) => ({ id: employee.id, name: '' })),
});
export function useCloudList<T extends { id: string }>(name: 'profiles' | 'users' | 'reviews' | 'timeline' | 'branches' | 'reviewSignals' | 'noteSignals', session: CloudSession, scope: RecordScope | null = { all: true }) {
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const latest = useRef<T[]>([]);
  const generation = useRef(0);
  const failures = useRef(0);
  const [confirmedQuery, setConfirmedQuery] = useState<string | null>(null);
  const [cacheRevision, setCacheRevision] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const invalidate = () => setCacheRevision(value => value + 1);
    window.addEventListener('rev4-cache-changed', invalidate);
    const online = () => setCacheRevision(value => value + 1);
    window.addEventListener('online', online);
    return () => { window.removeEventListener('rev4-cache-changed', invalidate); window.removeEventListener('online', online); };
  }, []);
  const scopeKey = JSON.stringify(scope);
  const sessionKey = JSON.stringify([session.uid, session.account?.id, session.account?.role, session.account?.branch]);
  useEffect(() => setWriteError(null), [sessionKey]);
  let canonicalFilters: ReturnType<typeof recordFilters> = null;
  try { if (session.account) canonicalFilters = recordFilters(name, scope, session.account); } catch { /* reported in effect */ }
  const sourceName = name === 'users' && session.account?.role !== 'admin' ? 'profiles' : name;
  const queryKey = readNamespace(session) + sourceName + '|' + JSON.stringify([canonicalFilters, session.dataVersion || 'session']);
  const currentSession = useRef(sessionKey);
  currentSession.current = sessionKey;
  const enabled = scope !== null;
  useEffect(() => {
    const epoch = ++generation.current;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    latest.current = []; setRows([]); setReady(false); setConfirmedQuery(null); setError(null);
    if (!session.account || !enabled) return;
    const role = session.account.role;
    const source = name === 'users' && role !== 'admin' ? 'profiles' : name;
    let filters;
    try { filters = recordFilters(name, JSON.parse(scopeKey), session.account); }
    catch { setError('تعذر تحميل السجلات: نطاق الاستعلام غير صالح'); return; }
    if (filters === null) return;
    const constraints = filters.map(filter => where(filter.field, filter.op, filter.value));
    const ref = collection(db, APP_PATH, source);
    const sourceQuery = constraints.length ? query(ref, or(...constraints)) : query(ref);
    const load = async () => {
      const snapshot = await boundedRead<QuerySnapshot>((next, error) => onSnapshot(sourceQuery, { includeMetadataChanges: true }, next, error), {
        source, scope: !constraints.length ? 'all' : filters.some(f => f.field === 'branch') ? filters.length > 1 ? 'mixed' : 'branch' : 'employee',
      });
      return snapshot.docs.map(document => document.data() as T);
    };
    const persistent = source !== 'users' && typeof indexedDB !== 'undefined';
    void cachedRows<T>(queryKey, load, persistent).then(result => {
      if (epoch !== generation.current) return;
      let data = result;
      if (name === 'users' && role !== 'admin') data = data.map(row => row.id === session.account!.id ? session.account as unknown as T : { email: '', ...row });
      failures.current = 0;
      latest.current = data; setRows(data);
      setReady(true); setConfirmedQuery(queryKey); setError(null);
    }).catch(reason => { if (epoch === generation.current) {
      setError('تعذر الاتصال. ستستأنف المزامنة تلقائيًا.'); setReady(false);
      if (typeof window !== 'undefined' && reason?.code !== 'permission-denied') retryTimer = setTimeout(() => setCacheRevision(value => value + 1), Math.min(300_000, 5_000 * 2 ** failures.current++));
    } });
    return () => { clearTimeout(retryTimer); if (generation.current === epoch) generation.current = epoch + 1; };

  }, [name, session.account, session.uid, scopeKey, queryKey, enabled, cacheRevision]);

  const queryReady = enabled && ready && confirmedQuery === queryKey;

  const change = (action: React.SetStateAction<T[]>) => {
    if (name === 'profiles' || !queryReady || !session.account) { setError('انتظري اكتمال تحميل البيانات قبل التعديل'); return; }
    const before = latest.current;
    const after = typeof action === 'function' ? action(before) : action;
    const previous = new Map(before.map(row => [row.id, row]));
    const next = new Map(after.map(row => [row.id, row]));
    const changed = [...next.values()].filter(row => JSON.stringify(row) !== JSON.stringify(previous.get(row.id)));
    const removed = [...previous.values()].filter(row => !next.has(row.id));
    if (!changed.length && !removed.length) return;
    const writeSession = sessionKey;
    const writeGeneration = generation.current;
    setPending(p => p + 1); setError(null); setWriteError(null);
    // Firebase's local latency compensation emits pending and server-confirmed snapshots.
    void (async () => {
      const affectedSources = new Set<string>([name]);
      const operations: Array<(batch: Transaction) => void> = [];
      const expected: Array<{ ref: DocumentReference; row: T | undefined }> = [];
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
        expected.push({ ref: doc(db, APP_PATH, name, id), row: old });
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
          if (name === 'reviews' && (!old || JSON.stringify(reviewSignal(old)) !== JSON.stringify(reviewSignal(data)))) { affectedSources.add('reviewSignals'); batch.set(doc(db, APP_PATH, 'reviewSignals', ref.id), reviewSignal(data)); }
          if (name === 'timeline' && data.type === 'gap' && (!old || (old as unknown as { type: string }).type !== 'gap' || JSON.stringify(noteSignal(old)) !== JSON.stringify(noteSignal(data)))) { affectedSources.add('noteSignals'); batch.set(doc(db, APP_PATH, 'noteSignals', ref.id), noteSignal(data)); }
          if (name === 'users' && session.account!.role === 'admin' && (!old || JSON.stringify(publicProfile(old as unknown as UserAccount)) !== JSON.stringify(publicProfile(data)))) { affectedSources.add('profiles'); batch.set(doc(db, APP_PATH, 'profiles', id), publicProfile(data)); }
          if (name === 'timeline' && data.type === 'shift') { affectedSources.add('shifts'); batch.set(doc(db, APP_PATH, 'shifts', id), data); }
        });
      }
      for (const row of removed) {
        const id = await cloudId(row.id);
        expected.push({ ref: doc(db, APP_PATH, name, id), row });
        operations.push(batch => {
          batch.delete(doc(db, APP_PATH, name, id));
          if (name === 'reviews') { affectedSources.add('reviewSignals'); batch.delete(doc(db, APP_PATH, 'reviewSignals', id)); }
          if (name === 'timeline' && (row as unknown as {type: string}).type === 'gap') { affectedSources.add('noteSignals'); batch.delete(doc(db, APP_PATH, 'noteSignals', id)); }
          if (name === 'users') { affectedSources.add('profiles'); batch.delete(doc(db, APP_PATH, 'profiles', id)); }
          if (name === 'timeline' && (row as unknown as {type: string}).type === 'shift') { affectedSources.add('shifts'); batch.delete(doc(db, APP_PATH, 'shifts', id)); }
        });
      }
      for (let offset = 0; offset < operations.length; offset += 100) {
        if (writeSession !== currentSession.current || !session.uid || auth.currentUser?.uid !== session.uid) return;
        await runTransaction(db, async transaction => {
          const checks = expected.slice(offset, offset + 100);
          const snapshots = await Promise.all(checks.map(item => transaction.get(item.ref)));
          if (writeSession !== currentSession.current || auth.currentUser?.uid !== session.uid) throw new Error('session-changed');
          snapshots.forEach((snapshot, index) => {
            const server = snapshot.exists() ? snapshot.data() : undefined;
            if (stableJSON(server) !== stableJSON(checks[index].row)) throw new Error('write-conflict');
          });
          operations.slice(offset, offset + 100).forEach(operation => operation(transaction));
        });
      }
      // Invalidate this account's stored results and notify its other open tabs.
      await Promise.all([...affectedSources].map(source => invalidateRows(readNamespace(session) + source + '|')));
      if (writeSession === currentSession.current && generation.current === writeGeneration) {
        latest.current = after; setRows(after);
      }
    })().catch(reason => {
      if (writeSession === currentSession.current) {
        setWriteError(reason instanceof Error && reason.message === 'write-conflict' ? 'تغيرت البيانات على الخادم؛ لم يُطبق التعديل القديم وتتم مزامنة النسخة الحالية تلقائيًا.' : 'لم يُحفظ التعديل في Firebase. تحققي من الاتصال والصلاحيات.');
        void invalidateRows(readNamespace(session) + name + '|');
      }
    })
      .finally(() => setPending(p => Math.max(0, p - 1)));
  };
  return { rows: confirmedQuery === queryKey ? rows : [], change, ready: !enabled || queryReady, error: writeError || error, pending };
}
