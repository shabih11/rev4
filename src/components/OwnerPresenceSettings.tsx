import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function OwnerPresenceSettings() {
  const [settings, setSettings] = useState<{ enabled: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_owner_presence_settings').abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        if (error || typeof data?.enabled !== 'boolean' || typeof data?.available !== 'boolean') throw new Error('Invalid settings');
        if (!controller.signal.aborted) setSettings(data);
      } catch { if (!controller.signal.aborted) setMessage('تعذر تحميل إعداد الحضور التلقائي.'); }
    })();
    return () => controller.abort();
  }, []);
  const toggle = async () => {
    if (!settings || busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('set_owner_presence_enabled', { requested: !settings.enabled }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      setSettings({ ...settings, enabled: !settings.enabled });
      setMessage(settings.enabled ? 'تم إيقاف الحضور التلقائي.' : 'تم تفعيل الحضور التلقائي.');
    } catch { setMessage('تعذر الحفظ. تحققي من الاتصال والصلاحيات.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="حضور محمد التلقائي" className="rounded-2xl border border-slate-200 p-5 space-y-3">
    <h3 className="text-lg font-bold">حضور محمد التلقائي</h3>
    <p className="text-sm text-slate-600 leading-7">ظهور مجدول في قائمة آخر المتصلات، منفصل عن الدخول الحقيقي. حتى ثلاث زيارات يوميًا مع أيام أقل أو بلا زيارات، والزيارة عشر دقائق. جلسة أطول لمدة نصف ساعة أو ساعة بحد أقصى مرة أسبوعيًا. لا ظهور تلقائي بين ١ صباحًا و٩ صباحًا بتوقيت الرياض.</p>
    <button type="button" role="switch" aria-checked={settings?.enabled ?? false} disabled={!settings?.available || busy} onClick={() => void toggle()} className="action-primary disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : settings?.enabled ? 'إيقاف الحضور التلقائي' : 'تفعيل الحضور التلقائي'}</button>
    {settings && !settings.available && <p className="text-sm text-amber-800">حساب العرض غير متاح.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
