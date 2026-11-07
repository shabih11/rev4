import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/accountAccess.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { getMyAccount } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const account = { id: 'synthetic-profile', role: 'employee', branch: 'synthetic-branch' };
const success = { data: account, error: null, status: 200 };
function clientFor(respond) {
  let calls = 0;
  return {
    get calls() { return calls; },
    rpc(name) {
      assert.equal(name, 'get_my_account');
      return { abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return respond(++calls); } };
    },
  };
}

test('pool exhaustion retries once and returns only the verified server account', async () => {
  const client = clientFor(call => call === 1 ? { data: null, error: { code: 'PGRST003' }, status: 504 } : success);
  assert.deepEqual(await getMyAccount(client, 'synthetic-token'), { account, error: null });
  assert.equal(client.calls, 2);
});
test('persistent transport failures finish without inventing an account', async () => {
  const client = clientFor(() => { throw new TypeError('Synthetic network failure'); });
  assert.deepEqual(await getMyAccount(client, 'synthetic-token'), { account: null, error: 'unavailable' });
  assert.equal(client.calls, 2);
});
test('overlapping checks share a request only within the same session and never cache access', async () => {
  let finish;
  const client = clientFor(() => new Promise(resolve => { finish = resolve; }));
  const first = getMyAccount(client, 'synthetic-token');
  assert.equal(getMyAccount(client, 'synthetic-token'), first);
  assert.equal(client.calls, 1);
  finish(success); await first;
  const fresh = getMyAccount(client, 'synthetic-token');
  assert.equal(client.calls, 2);
  finish({ data: null, error: null, status: 200 });
  assert.deepEqual(await fresh, { account: null, error: 'denied' });
  const previous = getMyAccount(client, 'previous-token'); const finishPrevious = finish;
  const next = getMyAccount(client, 'next-token'); const finishNext = finish;
  assert.equal(client.calls, 4);
  finishPrevious(success); finishNext({ ...success, data: { ...account, id: 'other-profile' } });
  assert.equal((await previous).account.id, 'synthetic-profile');
  assert.equal((await next).account.id, 'other-profile');
});
test('missing membership, invalid roles and permission denials never retry or grant access', async () => {
  for (const response of [
    { data: null, error: null, status: 200 },
    { data: { id: 'synthetic-profile', role: 'forged-admin' }, error: null, status: 200 },
    { data: { ...account, id: '' }, error: null, status: 200 },
    { data: null, error: { code: '42501' }, status: 403 },
    { data: null, error: { code: 'PGRST301' }, status: 401 },
  ]) {
    const client = clientFor(() => response);
    assert.deepEqual(await getMyAccount(client, 'synthetic-token'), { account: null, error: 'denied' });
    assert.equal(client.calls, 1);
  }
  const client = clientFor(() => success);
  assert.deepEqual(await getMyAccount(client, ''), { account: null, error: 'denied' });
  assert.equal(client.calls, 0);
});
test('non-transient API errors are reported as unavailable without retries', async () => {
  const client = clientFor(() => ({ data: null, error: { code: 'PGRST202' }, status: 404 }));
  assert.deepEqual(await getMyAccount(client, 'synthetic-token'), { account: null, error: 'unavailable' });
  assert.equal(client.calls, 1);
});
