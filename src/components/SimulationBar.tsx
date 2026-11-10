import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { simulationSnapshot, subscribeSimulation, setSimulation } from '../lib/simulationState';
import type { UserAccount } from '../lib/mockData';
export function SimulationBar() {
  const { user } = useAuth();
  const simulation = useSyncExternalStore(subscribeSimulation, simulationSnapshot);
  const [targets, setTargets] = useState<UserAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (simulation || user?.role !== 'admin') return;
    let active = true;
    void supabase.rpc('get_simulation_enabled').then(({ data, error }) => {
      if (!active) return;
      setEnabled(error ? null : data === true);
      if (error) setError('تعذر تحميل إعداد المحاكاة.');
    });
    return () => { active = false; };
  }, [simulation, user?.role, user?.id]);
  useEffect(() => {
    if (!simulation && (!enabled || user?.role !== 'admin')) return;
    let active = true;
    void supabase.rpc('simulation_targets').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setTargets([]);
        setSelected('');
        setError('تعذر تحميل الحسابات المتاحة للمحاكاة.');
      }
      else setTargets(data || []);
    });
    return () => { active = false; };
  }, [enabled, simulation, user?.role, user?.id]);
  if (!simulation && user?.role !== 'admin') return null;
  const changeEnabled = async (next: boolean) => {
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('set_simulation_enabled', { new_enabled: next });
      if (error) throw error;
      setEnabled(next);
      setTargets([]);
      setSelected('');
    } catch { setError('تعذر حفظ إعداد المحاكاة.'); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if ((!simulation && (!enabled || !user)) || !selected || busy) return;
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.rpc('start_simulation', { target_profile: selected });
      if (error || !data?.id || !data?.target) throw new Error();
      setSimulation({ id: data.id, target: data.target, actor: (simulation?.actor || user)! });
      window.location.hash = '/dashboard';
    } catch { setError('تعذر بدء المحاكاة. تحققي من الحساب والصلاحيات.'); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!simulation || busy) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('stop_simulation', { simulation_id: simulation.id });
      if (error) throw error;
      setSimulation(null); window.location.hash = '/dashboard';
    } catch { setError('تعذر تسجيل نهاية المحاكاة. أعيدي المحاولة؛ لم تُنفّذ أي تعديلات.'); }
    finally { setBusy(false); }
  };
  return <aside dir="rtl" aria-label="محاكاة الحسابات" className="sticky top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
    {simulation ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p><strong>محاكاة للقراءة فقط: {simulation.target.name}</strong> — {simulation.target.role === 'manager' ? 'مديرة فرع' : 'موظفة'} · {simulation.target.branch}<br /><span>المسؤول الأصلي: {simulation.actor.name} · النشاط لا يُحتسب للموظفة</span></p>
      <label className="flex flex-wrap items-center gap-2">التبديل إلى حساب آخر
        <select aria-label="التبديل إلى حساب آخر" value={selected} disabled={busy} onChange={event => setSelected(event.target.value)} className="max-w-full rounded-lg border bg-white p-2">
          <option value="">اختاري حسابًا</option>
          {targets.filter(target => target.id !== simulation.target.id).map(target => <option key={target.id} value={target.id}>{target.name} — {target.branch}</option>)}
        </select>
        <button disabled={!selected || busy} onClick={() => void start()} className="rounded-lg border border-amber-700 px-3 py-2">تبديل</button>
      </label>
      <button disabled={busy} onClick={() => void stop()} className="rounded-lg border border-amber-700 px-4 py-2 font-bold disabled:opacity-50">العودة إلى المسؤول</button>
    </div> : <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 font-bold">
        <input type="checkbox" className="accent-amber-900" checked={enabled === true}
          disabled={busy || enabled === null} onChange={event => void changeEnabled(event.target.checked)} />
        تفعيل المحاكاة
      </label>
      {enabled && <>
      <label htmlFor="simulation-target" className="font-bold">عرض كما تظهر للحساب</label>
      <select id="simulation-target" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy} className="max-w-full rounded-lg border border-amber-300 bg-white p-2">
        <option value="">اختاري موظفة أو مديرة فرع</option>
        {targets.map(target => <option key={target.id} value={target.id}>{target.name} — {target.role === 'manager' ? 'مديرة' : 'موظفة'} — {target.branch}</option>)}
      </select>
      <button onClick={() => void start()} disabled={!selected || busy} className="rounded-lg bg-amber-900 px-4 py-2 text-white disabled:opacity-40">بدء المحاكاة</button>
      <span>للقراءة فقط · العودة والتبديل دون تسجيل خروج</span>
      </>}
    </div>}
    {error && <p role="alert" className="mt-2">{error}</p>}
  </aside>;
}
