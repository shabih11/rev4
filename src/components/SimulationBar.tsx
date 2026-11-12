import { useEffect, useState, useSyncExternalStore } from 'react';
import { Eye, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { simulationSnapshot, subscribeSimulation, setSimulation } from '../lib/simulationState';
import type { UserAccount } from '../lib/mockData';
export function SimulationBar() {
  const { user } = useAuth();
  const simulation = useSyncExternalStore(subscribeSimulation, simulationSnapshot);
  const [targets, setTargets] = useState<UserAccount[]>([]);
  const [collapsed, setCollapsed] = useState(true);
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
    } catch { setError('تعذر حفظ إعداد المحاكاة.'); }
    finally { setBusy(false); }
  };
  const start = async (targetId: string) => {
    if ((!simulation && (!enabled || !user)) || !targetId || busy) return;
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.rpc('start_simulation', { target_profile: targetId });
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
      setSimulation(null); setCollapsed(true); window.location.hash = '/dashboard';
    } catch { setError('تعذر تسجيل نهاية المحاكاة. أعيدي المحاولة؛ لم تُنفّذ أي تعديلات.'); }
    finally { setBusy(false); }
  };
  if (collapsed) return <aside dir="rtl" aria-label="محاكاة الحسابات" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[100]">
    <button type="button" title="محاكاة الحسابات" aria-label="إظهار تفاصيل المحاكاة" aria-expanded={false} onClick={() => setCollapsed(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-700 shadow-lg focus-visible:ring-2 focus-visible:ring-slate-600"><Eye size={22} /><span className={`absolute bottom-0 end-0 h-3 w-3 rounded-full border-2 border-white ${simulation ? 'bg-teal-600' : 'bg-slate-400'}`} /></button>
  </aside>;
  return <aside dir="rtl" aria-label="محاكاة الحسابات" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[100] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-800 shadow-xl">
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="font-bold">محاكاة حساب{simulation ? ` (${simulation.target.name} - ${simulation.target.branch})` : ''}</p>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label="إغلاق وضع المحاكاة" disabled={busy} onClick={() => simulation ? void stop() : setCollapsed(true)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200 disabled:opacity-50"><X size={20} /></button>
        <button type="button" aria-label="طي تفاصيل المحاكاة" aria-expanded={true} aria-controls="simulation-details" onClick={() => setCollapsed(true)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200"><ChevronDown size={20} /></button>
      </div>
    </div>
    <div id="simulation-details" className="space-y-3">
      {!simulation && <label className="flex min-h-11 items-center gap-2 font-bold">
        <input type="checkbox" className="accent-slate-700" checked={enabled === true} disabled={busy || enabled === null} onChange={event => void changeEnabled(event.target.checked)} />
        تفعيل المحاكاة
      </label>}
      {(simulation || enabled) && <select aria-label="اختيار حساب للمحاكاة" value={simulation?.target.id || ''} disabled={busy || targets.length === 0} onChange={event => { if (event.target.value) void start(event.target.value); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3">
        <option value="">اختاري موظفة أو مديرة فرع</option>
        {targets.map(target => <option key={target.id} value={target.id}>{target.name} - {target.branch}</option>)}
      </select>}
    </div>
    {error && <p role="alert" className="mt-2 text-red-800">{error}</p>}
  </aside>;
}
