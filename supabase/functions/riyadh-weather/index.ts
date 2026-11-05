import { parseMetForecast } from '../../../src/lib/riyadhWeather.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const headers = { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const endpoint = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=24.7136&lon=46.6753&altitude=612';
let cached: { points: ReturnType<typeof parseMetForecast>; until: number; modified: string | null } | null = null;
let pending: Promise<void> | null = null;
let retryAt = 0;

async function refresh() {
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'rev4-weather/1.0 https://github.com/shabih11/rev4', ...(cached?.modified ? { 'If-Modified-Since': cached.modified } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  const expiry = Date.parse(response.headers.get('Expires') || '');
  const until = Math.max(Date.now() + 20 * 60000, Number.isFinite(expiry) ? expiry : 0);
  if (response.status === 304 && cached) { cached.until = until; return; }
  if (!response.ok) throw new Error('Weather unavailable');
  const points = parseMetForecast(await response.json());
  cached = { points, until, modified: response.headers.get('Last-Modified') };
}

// JWT verification is enabled at the gateway; this function reads no application data.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });
  try {
    if ((!cached || cached.until <= Date.now()) && Date.now() >= retryAt) {
      if (!pending) pending = refresh().catch(error => { retryAt = Date.now() + 60000; throw error; }).finally(() => { pending = null; });
      await pending;
    }
    if (!cached || !cached.points.some(point => point.time <= Date.now() && Date.now() - point.time < 3600000)) throw new Error('Weather unavailable');
    return new Response(JSON.stringify({ points: cached.points }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: 'weather_unavailable' }), { status: 503, headers: { ...headers, 'Retry-After': '60' } });
  }
});
