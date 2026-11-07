import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
let handler, callerRole = 'admin', authorized = true, authenticated = true, configured = true, updated = [], calls = [];
const caller = {
  auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'test-caller', user_metadata: { role: 'admin' } } : null } }) },
  rpc: async (name, args) => { calls.push([name, args]); if (name === 'get_my_account') return { data: { role: callerRole } }; return authorized ? { data: 'test-target-uuid' } : { error: { message: 'private details' } }; },
};
const admin = {
  auth: { admin: { updateUserById: async (...args) => { updated.push(args); return {}; } } },
  rpc: async name => { calls.push([name]); return name === 'employee_default_password' ? { data: configured ? 'test-only-default' : null } : {}; },
};
globalThis.__accountTestClient = (_url, key) => key === 'test-service' ? admin : caller;
globalThis.Deno = { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'test-service' : 'test-public' }, serve: fn => { handler = fn; } };
const source = readFileSync(new URL('../supabase/functions/employee-account/index.ts', import.meta.url), 'utf8').replace(/import \{ createClient \} from '[^']+';/, 'const createClient = globalThis.__accountTestClient;');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const request = (body, token = true) => new Request('https://test.invalid/account', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer synthetic-test-token' } : {}) }, body: JSON.stringify(body) });
const reset = () => { callerRole = 'admin'; authorized = true; authenticated = true; configured = true; updated = []; calls = []; };
test('account endpoint rejects unauthenticated and out-of-scope callers before admin writes', async () => {
  reset();
  assert.equal((await handler(request({ profileId: 'employee', action: 'reset' }, false))).status, 401);
  authenticated = false;
  assert.equal((await handler(request({ profileId: 'employee', action: 'reset' }))).status, 401);
  authenticated = true; authorized = false;
  const response = await handler(request({ profileId: 'employee', action: 'reset' }));
  assert.equal(response.status, 403);
  assert.equal((await response.text()).includes('private details'), false);
  assert.equal(updated.length, 0);
});
test('account reset fails closed without a configured default and never returns the password', async () => {
  reset(); configured = false;
  assert.equal((await handler(request({ profileId: 'employee', action: 'reset' }))).status, 503);
  assert.equal(updated.length, 0);
  configured = true;
  const response = await handler(request({ profileId: 'employee', action: 'reset' }));
  assert.equal(response.status, 200);
  assert.deepEqual(updated, [['test-target-uuid', { password: 'test-only-default' }]]);
  assert.equal((await response.text()).includes('test-only-default'), false);
  assert.equal(calls.at(-1)[0], 'finish_employee_account_change');
});
test('email is validated and only the SQL-authorized target is changed', async () => {
  reset();
  assert.equal((await handler(request({ profileId: 'employee', action: 'email', email: 'invalid' }))).status, 400);
  assert.equal(updated.length, 0);
  const response = await handler(request({ profileId: 'employee', targetUid: 'attacker-controlled', action: 'email', email: ' New@Example.invalid ' }));
  assert.equal(response.status, 200);
  assert.deepEqual(updated, [['test-target-uuid', { email: 'new@example.invalid', email_confirm: true }]]);
  assert.equal((await response.text()).includes('example.invalid'), false);
});

test('manager and employee roles cannot reach credential mutations even when target authorization would pass', async () => {
 for (const role of ['manager', 'employee', null]) {
  reset(); callerRole = role;
  for (const action of ['reset', 'email']) {
   const response = await handler(request({ profileId: 'employee', action, email: 'test@example.invalid' }));
   assert.equal(response.status, 403);
  }
  assert.equal(updated.length, 0);
  assert.equal(calls.some(([name]) => name === 'authorize_employee_account'), false);
 }
});
