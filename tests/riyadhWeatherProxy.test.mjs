import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { moduleUrl } from './helpers/typescript.mjs';

async function handler() {
  let handle;
  globalThis.Deno = { serve: fn => { handle = fn; } };
  const source = readFileSync(new URL('../supabase/functions/riyadh-weather/index.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
    .replace("'../../../src/lib/riyadhWeather.ts'", JSON.stringify(moduleUrl('riyadhWeather')));
  await import(`data:text/javascript;base64,${Buffer.from(code + `\n// ${Math.random()}`).toString('base64')}`);
  delete globalThis.Deno;
  return handle;
}

test('weather proxy pins Riyadh, identifies itself, coalesces requests and respects provider cache expiry', async t => {
  const now = Date.parse('2026-11-05T09:10:00Z');
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.match(url, /lat=24\.7136&lon=46\.6753/);
    assert.match(options.headers['User-Agent'], /github.com\/shabih11\/rev4/);
    return new Response(JSON.stringify({ properties: { timeseries: [{ time: '2026-11-05T09:00:00Z', data: {
      instant: { details: { air_temperature: 28, cloud_area_fraction: 10, wind_speed: 2 } },
      next_1_hours: { summary: { symbol_code: 'clearsky_day' }, details: { precipitation_amount: 0 } },
    } }] } }), { headers: { Expires: 'Thu, 05 Nov 2026 10:00:00 GMT' } });
  });
  const serve = await handler(), request = () => new Request('https://test.invalid/riyadh-weather');
  const responses = await Promise.all([serve(request()), serve(request())]);
  assert.equal(calls, 1);
  assert.equal(responses[0].status, 200);
  assert.equal((await responses[0].json()).points[0].temperature, 28);
  await serve(request());
  assert.equal(calls, 1);
  assert.equal((await serve(new Request(request(), { method: 'OPTIONS' }))).status, 200);
  assert.equal((await serve(new Request(request(), { method: 'POST' }))).status, 405);
});

test('upstream failure is explicit and retries are throttled', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('', { status: 429 }); });
  const serve = await handler(), request = () => new Request('https://test.invalid/riyadh-weather');
  const response = await serve(request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal((await serve(request())).status, 503);
  assert.equal(calls, 1);
});
