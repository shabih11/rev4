import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { UserAccount } from './mockData';
import { cachedRows, invalidateRows, readNamespace, stableJSON } from './browserReadCache';
import { type RecordScope } from './cloudReadPlan';
import { loadRows, rowChanges, scopeArguments, publicProfile } from './supabaseRecords';
export { publicProfile } from './supabaseRecords';
export interface CloudSession { account: UserAccount | null; ready: boolean; uid: string | null; error: string | null; dataVersion?: string }
export function useCloudSession(): CloudSession {
  const [session, setSession] = useState<CloudSession>({ account: null, ready: false, uid: null, error: null });
  useEffect(() => {
    let epoch = 0, stopped = false, namespace = '', signature = '', activeUid = '';
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const purge = () => { if (namespace) { void invalidateRows(namespace); namespace = ''; } };
    const verify = async (uid: string) => {
      if (uid !== activeUid || stopped) return;
      const current = ++epoch;
      try {
        const { data: verified, error: userError } = await supabase.auth.getUser();
        if (userError || verified.user?.id !== uid) throw new Error('invalid-session');
        const { data, error } = await supabase.rpc('get_my_account').abortSignal(AbortSignal.timeout(15000));
        if (error || !data || !['admin','manager','employee','viewer'].includes(data.role) || typeof data.id !== 'string') throw new Error('invalid-access');
        if (stopped || current !== epoch || uid !== activeUid) return;
        const next = readNamespace({ uid, account: data });
        if (namespace && next !== namespace) purge();
        namespace = next;
        setSession({ account: data as UserAccount, uid, ready: true, error: null });
      } catch {
        if (stopped || current !== epoch || uid !== activeUid) return;
        purge(); setSession({ account: null, uid, ready: true, error: 'الحساب غير مخوّل أو تعذر التحقق من صلاحياته. تواصلي مع الإدارة.' });
      }
    };
    const accountChanged = () => { if (activeUid) { purge(); void verify(activeUid); } };
    window.addEventListener('rev4-account-changed', accountChanged);
    const { data: authListener } = supabase.auth.onAuthStateChange((event, authSession) => {
      // Do not await Supabase inside this callback: it can deadlock token refresh.
      if (stopped) return;
      if (!authSession) {
        epoch++; signature = ''; activeUid = ''; purge();
        if (channel) void supabase.removeChannel(channel);
        setSession({ account: null, uid: null, ready: true, error: null }); return;
      }
      if (event === 'PASSWORD_RECOVERY' || signature === authSession.access_token) return;
      signature = authSession.access_token; activeUid = authSession.user.id;
      const uid = activeUid;
      epoch++;
      setSession({ account: null, uid, ready: false, error: null });
      if (channel) void supabase.removeChannel(channel);
      let subscribed = false;
      channel = supabase.channel(`access:${uid}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_access', filter: `uid=eq.${uid}` }, () => { purge(); void verify(uid); })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'user_access' }, payload => { if (payload.old.uid === uid) { purge(); void verify(uid); } })
        .subscribe(status => { if (status === 'SUBSCRIBED') { if (subscribed) void verify(uid); subscribed = true; } });
      setTimeout(() => { if (!stopped && signature === authSession.access_token) void verify(uid); }, 0);
    });
    return () => { stopped = true; epoch++; authListener.subscription.unsubscribe(); window.removeEventListener('rev4-account-changed', accountChanged); if (channel) void supabase.removeChannel(channel); };
  }, []);
  return session;
}
type Source = 'profiles' | 'users' | 'reviews' | 'timeline' | 'branches' | 'reviewSignals' | 'noteSignals';
export function useCloudList<T extends { id: string }>(name: Source, session: CloudSession, scope: RecordScope | null = { all: true }) {
  const [state, setState] = useState<{ key: string; rows: T[]; ready: boolean; error: string | null }>({ key: '', rows: [], ready: false, error: null });
  const [writeError, setWriteError] = useState<string | null>(null), [pending, setPending] = useState(0), [retry, setRetry] = useState(0);
  const generation = useRef(0), latest = useRef<T[]>([]), failures = useRef(0);
  const identity = stableJSON([session.uid, session.account?.id, session.account?.role, session.account?.branch]);
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  const namespace = readNamespace(session);
  let args: ReturnType<typeof scopeArguments> = null;
  try { if (session.account) args = scopeArguments(name, scope, session.account); } catch { /* Fail closed. */ }
  const key = namespace + name + '|' + stableJSON([args, session.dataVersion || 'initial']);
  const argsKey = JSON.stringify(args), enabled = scope !== null;
  const accountRole = session.account?.role;
  useEffect(() => { setWriteError(null); }, [identity]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    const reload = () => setRetry(x => x + 1);
    window.addEventListener('online', reload); window.addEventListener('rev4-cache-changed', reload);
    return () => { window.removeEventListener('online', reload); window.removeEventListener('rev4-cache-changed', reload); };
  }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    latest.current = []; setState({ key, rows: [], ready: false, error: null });
    if (!accountRole || !enabled) return;
    if (argsKey === 'null' || ['reviewSignals','noteSignals'].includes(name)) { setState({ key, rows: [], ready: false, error: 'نطاق تحميل البيانات غير صالح' }); return; }
    const source = name === 'users' && accountRole !== 'admin' ? 'profiles' : name;
    const requestArgs = { ...JSON.parse(argsKey), source };
    void cachedRows<T>(key, () => loadRows<T>(supabase, source, requestArgs), source !== 'users').then(rows => {
      if (epoch !== generation.current) return;
      failures.current = 0; latest.current = rows; setState({ key, rows, ready: true, error: null });
    }).catch(error => {
      if (epoch !== generation.current) return;
      setState({ key, rows: [], ready: false, error: 'تعذر تحميل البيانات. ستُستأنف المزامنة تلقائيًا.' });
      if (error?.code !== '42501' && error?.code !== 'PGRST301') timer = setTimeout(() => setRetry(x => x + 1), Math.min(300000, 5000 * 2 ** failures.current++));
    });
    return () => { clearTimeout(timer); };
  }, [key, argsKey, name, enabled, identity, retry, accountRole]);
  const ready = !enabled || (state.key === key && state.ready);
  const change = (action: React.SetStateAction<T[]>) => {
    if (session.account?.role === 'viewer') { setWriteError('هذا الحساب مخصص للعرض فقط'); return; }
    if (!ready || !session.account || !enabled || name === 'profiles') { setWriteError('انتظري اكتمال تحميل البيانات قبل التعديل'); return; }
    const before = latest.current, after = typeof action === 'function' ? action(before) : action;
    let changes;
    try { changes = rowChanges(name === 'users' ? before.map(publicProfile) : before, name === 'users' ? after.map(publicProfile) : after); } catch { setWriteError('توجد سجلات مكررة؛ لم يُحفظ التعديل'); return; }
    if (!changes.length) return;
    if (changes.length > 1500) { setWriteError('حجم التعديل أكبر من الحد المسموح للحفظ'); return; }
    if (name === 'timeline' && session.account.role === 'employee') {
      for (const item of changes) if (item.after && !item.before) Object.assign(item.after, { branch: session.account.branch,
        employees: [{ id: session.account.id, name: session.account.name }], createdBy: session.uid });
    }
    const writingIdentity = identity;
    setPending(x => x + 1); setWriteError(null);
    void (async () => {
      const { error } = await supabase.rpc('write_rows', { source: name, changes }).abortSignal(AbortSignal.timeout(30000));
      if (error) throw error;
      if (writingIdentity === currentIdentity.current) await invalidateRows(namespace);
    })().catch((error: { code?: string }) => {
      if (writingIdentity !== currentIdentity.current) return;
      setWriteError(error?.code === '40001' ? 'تغيرت البيانات؛ لم يُطبق التعديل القديم وتتم مزامنة النسخة الحالية.' : 'لم يُحفظ التعديل. تحققي من الاتصال والصلاحيات وصحة البيانات.');
      void invalidateRows(namespace);
    }).finally(() => setPending(x => Math.max(0, x - 1)));
  };
  return { rows: state.key === key ? state.rows : [], change, ready, pending, error: writeError || (enabled && state.key === key ? state.error : null) };
}
