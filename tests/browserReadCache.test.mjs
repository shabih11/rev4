import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const rows = new Map();
const originalIndexedDB = globalThis.indexedDB;
globalThis.indexedDB = {
 open() {
  const request = {};
  setImmediate(() => {
   request.result = {
    createObjectStore() {}, close() {},
    transaction() {
     const tx = { objectStore() { return {
      get(key) { return { result: structuredClone(rows.get(key)) }; },
      getAll() { return { result: structuredClone([...rows.values()]) }; },
      put(value) { rows.set(value.key, structuredClone(value)); },
      delete(key) { rows.delete(key); },
     }; } };
     setImmediate(() => tx.oncomplete?.());
     return tx;
    },
   };
   request.onupgradeneeded?.(); request.onsuccess?.();
  });
  return request;
 },
};
const source = ts.transpileModule(readFileSync(new URL('../src/lib/browserReadCache.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let sequence = 0;
const freshModule = () => import('data:text/javascript;base64,'+Buffer.from(source+'\n// instance '+sequence++).toString('base64'));
const a = await freshModule();

test('a confirmed result survives a new module instance without another source read', async () => {
 let reads=0;
 await a.cachedRows('account|reviews|v1',async()=>{reads++;return[{id:'synthetic-review'}];});
 const b = await freshModule();
 assert.deepEqual(await b.cachedRows('account|reviews|v1',async()=>{reads++;return[];}),[{id:'synthetic-review'}]);
 assert.equal(reads,1);
});
test('simultaneous requests share one load and empty results are complete', async () => {
 let reads=0;
 const load=async()=>{reads++;await new Promise(resolve=>setImmediate(resolve));return[];};
 await Promise.all([a.cachedRows('empty|v1',load),a.cachedRows('empty|v1',load)]);
 await a.cachedRows('empty|v1',load); assert.equal(reads,1);
});
test('failed requests are not persisted and the next attempt can succeed', async () => {
 await assert.rejects(a.cachedRows('failure|v1',async()=>{throw Error('offline');}));
 assert.deepEqual(await a.cachedRows('failure|v1',async()=>[{id:'recovered'}]),[{id:'recovered'}]);
});
test('different accounts, roles, filters and data versions never share cached results', async () => {
 const base={uid:'test-account',account:{id:'employee',role:'employee',branch:'test-branch'}};
 const key=a.readNamespace(base);
 assert.notEqual(key,a.readNamespace({...base,uid:'another-account'}));
 assert.notEqual(key,a.readNamespace({...base,account:{...base.account,role:'admin'}}));
 let reads=0;for(const suffix of ['reviews|v1','reviews|v2','timeline|v1'])await a.cachedRows(key+suffix,async()=>{reads++;return[];});assert.equal(reads,3);
});
test('namespace invalidation removes persisted results without deleting another account', async () => {
 await a.storeRows('erase|reviews',[]);await a.storeRows('keep|reviews',[{id:'kept'}]);
 await a.invalidateRows('erase|');
 const b=await freshModule();assert.equal(await b.getStoredRows('erase|reviews'),null);assert.deepEqual(await b.getStoredRows('keep|reviews'),[{id:'kept'}]);
});
test('oversized or expired entries cannot become permanent cached results', async () => {
 await a.storeRows('too-large',[{value:'x'.repeat(21*1024*1024)}]);assert.equal(await a.getStoredRows('too-large'),null);
 rows.set('expired',{key:'expired',savedAt:Date.now()-31*86400000,rows:[],bytes:2});assert.equal(await a.getStoredRows('expired'),null);
});
test('the fallback cycle advances at 22:15 Riyadh rather than every page visit',()=>{
 assert.equal(a.fallbackRevision(new Date('2026-10-20T19:14:59Z')),'2026-10-20');
 assert.equal(a.fallbackRevision(new Date('2026-10-20T19:15:00Z')),'2026-10-21');
});
test('stable comparison checks nested values and ignores object field order',()=>{
 assert.equal(a.stableJSON({stats:{a:1,b:2}}),a.stableJSON({stats:{b:2,a:1}}));
 assert.notEqual(a.stableJSON({stats:{a:1}}),a.stableJSON({stats:{a:2}}));
});
test.after(()=>{globalThis.indexedDB=originalIndexedDB;});

test('Web Locks coordinate cold loads from two module instances', async () => {
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');
 const queues=new Map();
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request(name,callback){
  const previous=queues.get(name)||Promise.resolve();const next=previous.catch(()=>{}).then(callback);queues.set(name,next);return next;
 }}});
 try {
  const b=await freshModule(),c=await freshModule();let reads=0;
  const load=async()=>{reads++;await new Promise(resolve=>setImmediate(resolve));return[{id:'shared-synthetic'}];};
  await Promise.all([b.cachedRows('two-tabs|v1',load),c.cachedRows('two-tabs|v1',load)]);assert.equal(reads,1);
 } finally {if(descriptor)Object.defineProperty(navigator,'locks',descriptor);else delete navigator.locks;}
});
test('blocked browser storage falls back to shared memory without failing the read',async()=>{
 const previous=globalThis.indexedDB;globalThis.indexedDB={open(){throw Error('storage unavailable');}};
 try {const b=await freshModule();let reads=0;const load=async()=>{reads++;return[{id:'memory-only'}];};await b.cachedRows('blocked',load);await b.cachedRows('blocked',load);assert.equal(reads,1);}
 finally{globalThis.indexedDB=previous;}
});
