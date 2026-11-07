import { useState } from 'react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import type { MagicSettings } from '../lib/gems';
export function MagicStoreAdmin() {
  const { features, currentAccount } = useData();
  if (currentAccount?.role !== 'admin') return null;
  const settings = features?.store?.magic?.settings;
  if (!settings) return <p role="status" className="rounded-xl border p-4 text-slate-600">إعدادات الصندوق والجواهر غير متاحة حاليًا.</p>;
  return <MagicSettingsForm key={JSON.stringify(settings)} initial={settings}/>;
}
function MagicSettingsForm({ initial }: { initial: MagicSettings }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="rounded-2xl border border-slate-200 p-5 space-y-5" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    if (!Number.isFinite(settings.price) || settings.price < 0 || settings.price > 1000000 || Math.abs(Math.round(settings.price * 100) - settings.price * 100) > .00001) { setMessage('أدخلي سعرًا صحيحًا حتى منزلتين عشريتين.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('save_magic_settings', { requested: settings, expected: initial });
      if (error) throw error;
      setMessage('تم حفظ الإعدادات.'); window.dispatchEvent(new Event('rev4-cache-changed'));
    } catch { setMessage('تعذر الحفظ. تحققي من الاتصال وحدّثي الإعدادات.'); }
    finally { setBusy(false); }
  }}>
    <h3 className="text-xl font-black">الصندوق السحري ومظهر الجواهر</h3>
    <label className="flex items-center gap-3 font-bold"><input type="checkbox" role="switch" checked={settings.boxes} onChange={event => setSettings({ ...settings, boxes: event.target.checked })}/>الصندوق السحري</label>
    <label className="block text-sm font-bold">سعر الصندوق من رصيد المتجر<input type="number" required min="0" max="1000000" step="0.01" value={settings.price} onChange={event => setSettings({ ...settings, price: event.target.valueAsNumber })} className="block mt-2 w-full rounded-xl border p-3"/></label>
    <label className="flex items-center gap-3 font-bold"><input type="checkbox" role="switch" checked={settings.themes} onChange={event => setSettings({ ...settings, themes: event.target.checked })}/>تغيير مظهر الواجهة بالجوهرة</label>
    <p className="text-sm text-slate-600">الميّزتان مستقلتان. قد تتكرر الجوهرة عند فتح صندوق جديد.</p>
    {message && <p role="status" className="text-indigo-900">{message}</p>}
    <button disabled={busy} className="action-primary">{busy ? 'جارٍ الحفظ…' : 'حفظ إعدادات الصندوق'}</button>
  </form>;
}
