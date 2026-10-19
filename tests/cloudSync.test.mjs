import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const toUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const planUrl = toUrl(compile(readFileSync(new URL('../src/lib/cloudReadPlan.ts', import.meta.url), 'utf8')));
let active;
globalThis.__cloudSyncTest = {
  useRef(value) { const index = active.cursor++; return active.slots[index] ??= { current: value }; },
  useState(value) {
    const run = active;
    const index = run.cursor++;
    if (!(index in run.slots)) run.slots[index] = typeof value === 'function' ? value() : value;
    return [run.slots[index], value => { run.slots[index] = typeof value === 'function' ? value(run.slots[index]) : value; }];
  },
  useEffect(effect, deps) {
    const run = active;
    const index = run.cursor++;
    const previous = run.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      run.effects.push(() => { previous?.cleanup?.(); run.slots[index] = { deps, cleanup: effect() }; });
    }
  },
  collection(...parts) { return parts.slice(1).join('/'); },
  doc(...parts) { return parts.slice(1).join('/'); },
  where(field, op, value) { return { field, op, value }; },
  or(...filters) { return { or: filters }; },
  query(path, ...filters) { return { path, filters }; },
  onSnapshot(target, _options, next, error) {
    const entry = { target, next, error, closed: false };
    active.listeners.push(entry);
    return () => { entry.closed = true; };
  },
  writeBatch() {
    const run = active;
    const ops = [];
    return {
      set(path, value) { ops.push({ kind: 'set', path, value }); },
      update(path, value) { ops.push({ kind: 'update', path, value }); },
      delete(path) { ops.push({ kind: 'delete', path }); },
      async commit() { run.commits.push(ops); },
    };
  },
  deleteField() { return 'deleted-field'; },
  getDoc() { throw new Error('unexpected auth lookup'); },
  onAuthStateChanged() { throw new Error('unexpected auth subscription'); },
};
const mock = toUrl('export const { useRef,useState,useEffect,collection,doc,where,or,query,onSnapshot,writeBatch,deleteField,getDoc,onAuthStateChanged } = globalThis.__cloudSyncTest;');
let source = compile(readFileSync(new URL('../src/lib/cloudSync.ts', import.meta.url), 'utf8'));
source = source.replaceAll(/from '(react|firebase\/auth|firebase\/firestore)'/g, `from ${JSON.stringify(mock)}`)
  .replace("from './firebase'", `from ${JSON.stringify(toUrl("export const db = {}; export const auth = globalThis.__cloudSyncTestAuth = {currentUser:{uid:'test-uid'}}; export const APP_PATH = 'apps/test';"))}`)
  .replace("from './cloudReadPlan'", `from ${JSON.stringify(planUrl)}`);
const { useCloudList } = await import(toUrl(source));
const session = { uid: 'test-uid', ready: true, error: null, account: { id: 'test-admin', name: 'Test', role: 'admin', branch: 'b' } };
const review = { id: 'test-review', branch: 'b', rating: '5', date: '01-10-2026', time: '12:00', linkedEmployeeIds: ['test-e'], comment: 'before' };

function harness(name = 'reviews', initialScope = { branches: ['b'] }) {
  globalThis.__cloudSyncTestAuth.currentUser = { uid: 'test-uid' };
  const run = { slots: [], cursor: 0, effects: [], listeners: [], commits: [], scope: initialScope, session };
  run.render = function TestCloudList() {
    active = run; run.cursor = 0; run.effects = [];
    const result = useCloudList(name, run.session, run.scope);
    run.effects.forEach(effect => effect());
    return result;
  };
  run.snapshot = (rows, fromCache = false, listener = run.listeners.at(-1)) => listener.next({ docs: rows.map(row => ({ data: () => row })), metadata: { fromCache } });
  return run;
}
async function finishWrites(run, expected) {
  const deadline = Date.now() + 2000;
  while (run.commits.length < expected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(run.commits.length, expected);
}

test('disabled details create zero listeners and cannot write', () => {
  const run = harness('reviews', null);
  const result = run.render();
  assert.equal(run.listeners.length, 0);
  assert.equal(result.ready, true);
  result.change([review]);
  assert.equal(run.commits.length, 0);
});

test('cache snapshots cannot authorize writes, and scope changes hide stale rows immediately', () => {
  const run = harness(); run.render();
  const first = run.listeners[0];
  assert.deepEqual(first.target.filters[0].or, [{ field: 'branch', op: 'in', value: ['b'] }]);
  run.snapshot([review], true);
  let result = run.render();
  assert.equal(result.ready, false);
  result.change([]);
  assert.equal(run.commits.length, 0);
  run.snapshot([review]);
  assert.equal(run.render().ready, true);
  run.scope = { branches: ['c'] };
  result = run.render();
  assert.equal(result.ready, false);
  assert.deepEqual(result.rows, []);
  assert.equal(first.closed, true);
  run.snapshot([review], false, first);
  assert.deepEqual(run.render().rows, []);
  run.snapshot([{ ...review, id: 'other', branch: 'c' }]);
  assert.deepEqual(run.render().rows.map(row => row.id), ['other']);
});

test('editing only review text does not rewrite its public score signal', async () => {
  const run = harness(); run.render(); run.snapshot([review]);
  run.render().change([{ ...review, comment: 'after' }]);
  await finishWrites(run, 1);
  assert.equal(run.commits[0].length, 1);
  assert.match(run.commits[0][0].path, /\/reviews\//);
  assert.equal(run.commits[0][0].kind, 'update');
  run.render().change([{ ...review, rating: '1' }]);
  await finishWrites(run, 2);
  assert.equal(run.commits[1].length, 2);
  assert.match(run.commits[1][1].path, /\/reviewSignals\//);
});

test('changing a detail scope does not cancel an already authorized write', async () => {
  const run = harness(); run.render(); run.snapshot([review]);
  run.render().change([{ ...review, comment: 'after' }]);
  run.scope = null; run.render();
  await finishWrites(run, 1);
  assert.equal(run.commits[0].length, 1);
});

test('signing out cancels writes that have not been submitted and hides old data', async () => {
  const run = harness(); run.render(); run.snapshot([review]);
  run.render().change([{ ...review, comment: 'after' }]);
  run.session = { ...session, uid: null, account: null };
  assert.deepEqual(run.render().rows, []);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(run.commits.length, 0);
});

test('an edit deletes only the explicitly removed scoped document', async () => {
  const run = harness(); run.render(); run.snapshot([review]);
  run.render().change([]);
  await finishWrites(run, 1);
  assert.equal(run.commits[0].length, 2);
  assert.ok(run.commits[0].every(op => op.kind === 'delete'));
  assert.equal(new Set(run.commits[0].map(op => op.path.split('/').at(-1))).size, 1);
});

test('a note text edit does not rewrite its score signal', async () => {
  const run = harness('timeline'); run.render();
  const note = { id: 'test-note', type: 'gap', title: 'شكوى', branch: 'b', time: '12:00', employees: [], employeeIds: [], comment: 'before' };
  run.snapshot([note]);
  run.render().change([{ ...note, comment: 'after' }]);
  await finishWrites(run, 1);
  assert.equal(run.commits[0].length, 1);
  assert.match(run.commits[0][0].path, /\/timeline\//);
});

test('an Auth identity switch blocks a queued write before React renders the new session', async () => {
  const run = harness(); run.render(); run.snapshot([review]);
  run.render().change([{ ...review, comment: 'after' }]);
  globalThis.__cloudSyncTestAuth.currentUser = { uid: 'different-user' };
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(run.commits.length, 0);
});

test('an email-only profile edit does not rewrite the public directory', async () => {
  const run = harness('users', { all: true }); run.render();
  const user = { id: 'test-user', role: 'employee', name: 'Synthetic', branch: 'b', email: 'before@example.invalid' };
  run.snapshot([user]);
  run.render().change([{ ...user, email: 'after@example.invalid' }]);
  await finishWrites(run, 1);
  assert.equal(run.commits[0].length, 1);
  assert.match(run.commits[0][0].path, /\/users\//);
});

test('equivalent rerenders keep the same subscription and invalid requests never fall back to a full collection', () => {
  const run = harness(); run.render();
  run.scope = { branches: ['b'] }; run.render();
  assert.equal(run.listeners.length, 1);
  run.scope = { employeeIds: Array.from({ length: 31 }, (_, i) => `test-${i}`) };
  run.render();
  assert.equal(run.listeners.length, 1);
  assert.ok(run.render().error);
});
