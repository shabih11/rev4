import {test} from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const {periodReviewLeaders}=await import(moduleUrl('employeeActivity'));
const start=Date.UTC(2026,9,11),end=Date.UTC(2026,9,17);
const review=(id,date,ids)=>({id,date,linkedEmployeeIds:ids,rating:'5',branch:'a',time:'10:00'});
test('selected period includes both boundaries, ignores outside dates, and counts each review once per employee',()=>{
 const first=review('1','11-10-2026',['a','a']);
 const rows=[first,first,review('2','2026-10-17',['a']),review('3','18-10-2026',['b']),review('4','10-10-2026',['b']),review('5','12-10-2026',['b']),review('6','12-10-2026',[])];
 assert.deepEqual(periodReviewLeaders(rows,start,end),{ids:['a'],count:2});
});
test('ties highlight all leaders and empty periods highlight nobody',()=>{
 const rows=[review('1','12-10-2026',['a','b'])];
 assert.deepEqual(periodReviewLeaders(rows,start,end),{ids:['a','b'],count:1});
 assert.deepEqual(periodReviewLeaders(rows,end+86400000,end+2*86400000),{ids:[],count:0});
});
