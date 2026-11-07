import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseWeatherForecast, type RiyadhWeather } from '../lib/riyadhWeather';

const REFRESH = 20 * 60000;
let cached: { points: RiyadhWeather[]; until: number } | null = null;
let pending: Promise<RiyadhWeather[]> | null = null;

function loadWeather() {
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.points);
  if (!pending) pending = (async () => {
    const { data, error } = await supabase.functions.invoke('riyadh-weather', { method: 'GET' });
    if (error) throw error;
    const points = parseWeatherForecast(data?.points);
    cached = { points, until: Date.now() + REFRESH };
    return points;
  })().finally(() => { pending = null; });
  return pending;
}

export function useRiyadhWeather() {
  const [points, setPoints] = useState<RiyadhWeather[]>(cached?.points || []);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const points = await loadWeather();
        if (active) { setPoints(points); setFailed(false); }
      } catch { if (active) setFailed(true); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, REFRESH + Math.random() * 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return { points, failed };
}
