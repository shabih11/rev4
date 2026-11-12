import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import './OnlineEmployees.css';

export function OnlineEmployees() {
  const { user } = useAuth();
  const { users } = useData();
  const [open, setOpen] = useState(false);
  const [presence, setPresence] = useState<{ owner: string; expires: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const viewerId = user && ['employee', 'admin', 'manager', 'viewer'].includes(user.role) ? user.id : null;
  useLayoutEffect(() => {
    if (!viewerId || !root.current) return;
    const node = root.current, page = node.parentElement!;
    const header = page.querySelector('.recognition-header');
    const platform = page.querySelector('.crystal-platform');
    const measure = () => {
      const origin = page.getBoundingClientRect().top;
      const top = (header?.getBoundingClientRect().bottom ?? origin) - origin + 12;
      const bottom = (platform?.getBoundingClientRect().top ?? page.getBoundingClientRect().bottom) - origin - 12;
      node.style.top = `${top}px`;
      node.style.maxHeight = `${Math.max(44, bottom - top)}px`;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    if (header) observer.observe(header);
    if (platform) observer.observe(platform);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [viewerId]);
  useEffect(() => {
    if (!viewerId) return;
    let active = true, loading = false;
    const controller = new AbortController();
    const load = async () => {
      if (loading || document.visibilityState !== 'visible') return;
      loading = true;
      try {
        const { data, error } = await supabase.rpc('get_online_employees').abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        if (error || !data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) throw new Error('Invalid presence');
        if (active) { setPresence({ owner: viewerId, expires: data }); setFailed(false); setNow(Date.now()); }
      } catch { if (active) { setFailed(true); setPresence(null); } }
      finally { loading = false; }
    };
    void load();
    const poll = window.setInterval(() => void load(), 30000);
    const clock = window.setInterval(() => setNow(Date.now()), 10000);
    const visible = () => { setNow(Date.now()); void load(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => { active = false; controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); };
  }, [viewerId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!viewerId) return null;
  const expires = presence?.owner === viewerId ? presence.expires : {};
  const recent = users.filter(employee => employee.role !== 'admin' && expires[employee.id])
    .sort((a, b) => Date.parse(expires[b.id]) - Date.parse(expires[a.id]) || a.id.localeCompare(b.id));
  const online = recent.filter(employee => Date.parse(expires[employee.id]) > now);
  const status = failed ? 'تعذر التحميل' : !presence ? 'جارٍ تحميل المتصلات…' : online.length ? 'نشاط خلال آخر خمس دقائق' : 'لا توجد موظفات متصلات خلال آخر خمس دقائق';
  return <div className="online-employees" ref={root}>
    <button ref={button} type="button" className="online-employees-toggle" aria-label="الموظفات المتصلات" title={status} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <Eye size={23} aria-hidden="true" />
      <span className="online-employees-dot" data-online={online.length > 0} aria-hidden="true" />
    </button>
    <section id={panelId} className={`online-employees-panel ${open ? 'is-open' : 'is-preview'}`} aria-label="آخر المتصلات">
      {(failed || !presence || recent.length === 0) && <p className="online-employees-status" role="status">{failed ? 'تعذر التحميل' : !presence ? 'جارٍ تحميل المتصلات…' : 'لم يُسجل حضور بعد'}</p>}
      {recent.length > 0 && <ul>{(open ? recent : recent.slice(0, 5)).map(employee => <li key={employee.id}>
        {Date.parse(expires[employee.id]) > now && <span className="online-employees-name-dot" role="img" aria-label="متصلة خلال آخر خمس دقائق" />}
        <span>{employee.role === 'manager' ? `إدارة ${employee.branch.replace(/^فرع\s+/, '').trim()}` : employee.name.trim() === 'محمد' ? 'محمد الحبيب' : employee.name}</span>
      </li>)}</ul>}
    </section>
  </div>;
}
