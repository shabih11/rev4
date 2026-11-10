import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataURL = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const stateURL = dataURL(compile('../src/lib/simulationState.ts'));
const { setSimulation } = await import(stateURL);
const { simulationFetch } = await import(dataURL(compile('../src/lib/simulationFetch.ts').replace("'./simulationState'", JSON.stringify(stateURL))));
const context = { id: 'simulation', actor: { id: 'admin' }, target: { id: 'employee' } };
const base = 'https://supabase.test.invalid';
test('simulation gateway preserves actor credentials and never sends mutation endpoints', async () => {
 const original = globalThis.fetch, calls = [];
 globalThis.fetch = async request => { calls.push(request); return new Response('[]'); };
 setSimulation(context);
 try {
   for (const path of ['/rest/v1/rpc/write_rows','/rest/v1/rpc/purchase_avatar','/rest/v1/rpc/record_employee_page_presence','/functions/v1/employee-account','/storage/v1/object/avatar-store/a.webp','/auth/v1/user']) {
     assert.equal((await simulationFetch(base + path, { method: 'POST', body: '{}' })).status, 403);
   }
   assert.equal(calls.length, 0);
   await simulationFetch(base + '/rest/v1/rpc/read_rows?offset=500&limit=500', { method: 'POST', headers: { Authorization: 'Bearer actor-token' }, body: JSON.stringify({ source: 'timeline' }) });
   assert.equal(calls.length, 1);
   assert.equal(calls[0].url, base + '/rest/v1/rpc/simulation_read');
   assert.equal(calls[0].headers.get('Authorization'), 'Bearer actor-token');
   assert.deepEqual(await calls[0].json(), { simulation_id: 'simulation', operation: 'read_rows', args: { source: 'timeline' }, query: { offset: '500', limit: '500' }, row_offset: 500, row_limit: 500 });
 } finally { setSimulation(null); globalThis.fetch = original; }
});
test('switching identities discards in-flight data, including previous administrator reads', async () => {
 const original = globalThis.fetch;
 let finish;
 globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
 setSimulation(null);
 try {
   const pending = simulationFetch(base + '/rest/v1/rpc/get_accounts', { method: 'POST', body: '{}' });
   setSimulation(context);
   finish(new Response('[{"id":"private-admin-data"}]'));
   await assert.rejects(pending, { name: 'AbortError' });
 } finally { setSimulation(null); globalThis.fetch = original; }
});
test('single reads unwrap correctly and expired/denied gateway reads never retry as administrator', async () => {
 const original = globalThis.fetch;
 setSimulation(context);
 try {
   globalThis.fetch = async () => new Response('[{"version":7}]');
   const result = await simulationFetch(base + '/rest/v1/app_state?select=version', { headers: { Accept: 'application/vnd.pgrst.object+json' } });
   assert.deepEqual(await result.json(), { version: 7 });
   let calls = 0;
   globalThis.fetch = async () => { calls++; return new Response('{"code":"42501"}', { status: 403 }); };
   assert.equal((await simulationFetch(base + '/rest/v1/rpc/get_read_model', { method: 'POST', body: '{}' })).status, 403);
   assert.equal(calls, 1);
 } finally { setSimulation(null); globalThis.fetch = original; }
});
