import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/lib/praisedEmployee.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {praiseCycle,nextPraiseCycle,praisedEmployee}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('praise advances at Riyadh midnight every two days, across month boundaries',()=>{
 const cycle=praiseCycle(Date.parse('2026-01-01T00:00:00+03:00'));
 assert.equal(praiseCycle(Date.parse('2026-01-02T23:59:59+03:00')),cycle);
 assert.equal(praiseCycle(Date.parse('2026-01-03T00:00:00+03:00')),nextPraiseCycle(cycle));
 const monthEnd=praiseCycle(Date.parse('2026-01-31T12:00:00+03:00'));
 assert.equal(praiseCycle(Date.parse('2026-02-01T23:59:59+03:00')),monthEnd);
});
test('current-cycle reviews do not change winner and ties are stable regardless of review order',()=>{
 const cycle=praiseCycle(Date.parse('2026-01-03T12:00:00+03:00'));
 const employees=[{id:'a'},{id:'b'}];
 const reviews=[{date:'٠٢-٠١-٢٠٢٦',linkedEmployeeIds:['a','a']},{date:'2026-01-02',linkedEmployeeIds:['b']},{date:'03-01-2026',linkedEmployeeIds:['b']},{date:'25-12-2025',linkedEmployeeIds:['b']},{date:'31-02-2026',linkedEmployeeIds:['b']}];
 assert.deepEqual(praisedEmployee(reviews,employees,cycle),{id:'a',count:1});
 assert.deepEqual(praisedEmployee([...reviews].reverse(),employees,cycle),{id:'a',count:1});
 assert.deepEqual(praisedEmployee(reviews,employees,nextPraiseCycle(cycle)),{id:'b',count:2});
 assert.deepEqual(praisedEmployee([],employees,cycle),{id:'',count:0});
});
