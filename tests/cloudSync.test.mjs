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
    const entry = { target, next, error, closed:false };
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
  onAuthStateChanged(_auth, callback) { active.authCallback=callback; return ()=>{}; },
};
const mock = toUrl('export const { useRef,useState,useEffect,collection,doc,where,or,query,onSnapshot,writeBatch,deleteField,getDoc,onAuthStateChanged } = globalThis.__cloudSyncTest;');
let source = compile(readFileSync(new URL('../src/lib/cloudSync.ts', import.meta.url), 'utf8'));
source = source.replaceAll(/from '(react|firebase\/auth|firebase\/firestore)'/g, `from ${JSON.stringify(mock)}`)
  .replace("from './firebase'", `from ${JSON.stringify(toUrl("export const db = {}; export const auth = globalThis.__cloudSyncTestAuth = {currentUser:{uid:'test-uid'}}; export const APP_PATH = 'apps/test';"))}`)
  .replace("from './cloudReadPlan'", `from ${JSON.stringify(planUrl)}`);
const { useCloudList, boundedRead, useCloudSession } = await import(toUrl(source));
const session = { uid: 'test-uid', ready: true, error: null, account: { id: 'test-admin', name: 'Test', role: 'admin', branch: 'b' } };
const review = { id: 'test-review', branch: 'b', rating: '5', date: '01-10-2026', time: '12:00', linkedEmployeeIds: ['test-e'], comment: 'before' };

let sequence = 0;
function harness(name = 'reviews', initialScope = { branches: ['b'] }) {
  const testSession = { ...session, uid: `uid-${++sequence}` };
  globalThis.__cloudSyncTestAuth.currentUser = { uid: testSession.uid };
  const run = { slots: [], cursor: 0, effects: [], listeners: [], commits: [], scope: initialScope, session: testSession };
  run.render = function TestCloudList() {
    active = run; run.cursor = 0; run.effects = [];
    const result = useCloudList(name, run.session, run.scope);
    run.effects.forEach(effect => effect());
    return result;
  };
  run.snapshot = async (rows, fromCache = false, listener = run.listeners.at(-1)) => { listener.next({ docs: rows.map(row => ({ data: () => row })), metadata: { fromCache } }); await new Promise(resolve => setImmediate(resolve)); };
  return run;
}
async function finishWrites(run, expected) {
  const deadline = Date.now() + 2000;
  while (run.commits.length < expected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(run.commits.length, expected);
}

test('closed detail requests read nothing and cannot write', () => {
 const run=harness('reviews',null);const result=run.render();assert.equal(run.listeners.length,0);result.change([review]);assert.equal(run.commits.length,0);
});
test('scope is read once and reused when a tab closes and reopens', async () => {
 const run=harness();run.render();await run.snapshot([review]);assert.equal(run.render().ready,true);assert.equal(run.listeners[0].closed,true);
 run.scope=null;run.render();run.scope={branches:['b']};run.render();await new Promise(resolve=>setImmediate(resolve));assert.equal(run.listeners.length,1);assert.equal(run.render().rows.length,1);
});
test('no server confirmation or offline result can authorize a write', async () => {
 const run=harness();let result=run.render();result.change([review]);assert.equal(run.commits.length,0);await run.snapshot([review],true);result=run.render();assert.equal(result.ready,false);result.change([]);assert.equal(run.commits.length,0);run.listeners[0].error(Error('offline'));await new Promise(resolve=>setImmediate(resolve));assert.ok(run.render().error);
});
test('late responses from the old scope cannot populate the new scope', async () => {
 const run=harness();run.render();const old=run.listeners[0];run.scope={branches:['c']};run.render();await run.snapshot([review],false,old);assert.deepEqual(run.render().rows,[]);await run.snapshot([]);assert.equal(run.render().ready,true);
});
test('comment-only updates do not rewrite the score mirror and update visible rows after commit', async () => {
 const run=harness();run.render();await run.snapshot([review]);run.render().change([{...review,comment:'after'}]);await finishWrites(run,1);await new Promise(resolve=>setImmediate(resolve));assert.equal(run.commits[0].length,1);assert.equal(run.render().rows[0].comment,'after');
});
test('a confirmed write invalidates the cached query for the next intentional open', async () => {
 const run=harness();run.render();await run.snapshot([review]);run.render().change([{...review,comment:'after'}]);await finishWrites(run,1);await new Promise(resolve=>setImmediate(resolve));run.scope=null;run.render();run.scope={branches:['b']};run.render();assert.equal(run.listeners.length,2);await run.snapshot([{...review,comment:'after'}]);
});
test('sign-out blocks queued writes and hides cached records', async () => {
 const run=harness();run.render();await run.snapshot([review]);run.render().change([{...review,comment:'after'}]);globalThis.__cloudSyncTestAuth.currentUser=null;run.session={uid:null,account:null,ready:true};assert.deepEqual(run.render().rows,[]);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(run.commits.length,0);
});
test('private profiles cannot be edited through the public-directory read path', async () => {
 const run=harness('profiles');run.render();await run.snapshot([{id:'test',name:'Test'}]);run.render().change([]);assert.equal(run.commits.length,0);
});
test('request failures become an error instead of permanent loading and can retry', async () => {
 const run=harness();run.render();run.listeners[0].error(Error('denied'));await new Promise(resolve=>setImmediate(resolve));assert.ok(run.render().error);run.scope=null;run.render();run.scope={branches:['b']};run.render();assert.equal(run.listeners.length,2);await run.snapshot([]);
});

test('the deadline closes the actual network listener, not only the loading indicator', async () => {
 const originalTimeout=globalThis.setTimeout, originalClear=globalThis.clearTimeout;
 let expire,closed=false;
 try {
  globalThis.setTimeout=callback=>{expire=callback;return 1;};globalThis.clearTimeout=()=>{};
  const promise=boundedRead(()=>()=>{closed=true;});
  expire();await assert.rejects(promise,/read-timeout/);assert.equal(closed,true);
 } finally {globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;}
});

function sessionHarness() {
 const run={slots:[],cursor:0,effects:[],listeners:[],commits:[]};
 run.render=()=>{active=run;run.cursor=0;run.effects=[];const result=useCloudSession();run.effects.forEach(f=>f());return result;};
 return run;
}
test('Auth waits for confirmed access and profile before exposing the account',async()=>{
 const run=sessionHarness();run.render();const pending=run.authCallback({uid:'auth-test'});
 run.listeners[0].next({metadata:{fromCache:true},exists:()=>true,data:()=>({profileDocId:'profile-test'})});
 assert.equal(run.render().account,null);
 run.listeners[0].next({metadata:{fromCache:false},exists:()=>true,data:()=>({profileDocId:'profile-test'})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(run.listeners[0].closed,true);assert.equal(run.listeners.length,2);
 run.listeners[1].next({metadata:{fromCache:false},exists:()=>true,data:()=>({id:'e',role:'employee',branch:'شرق'})});await pending;
 assert.equal(run.render().account.role,'employee');assert.equal(run.listeners[1].closed,true);
});
test('a stale Auth lookup after sign-out cannot start a private profile read',async()=>{
 const run=sessionHarness();run.render();const pending=run.authCallback({uid:'old-auth'});await run.authCallback(null);
 run.listeners[0].next({metadata:{fromCache:false},exists:()=>true,data:()=>({profileDocId:'private-profile'})});await pending;
 assert.equal(run.listeners.length,1);assert.equal(run.render().account,null);
});
