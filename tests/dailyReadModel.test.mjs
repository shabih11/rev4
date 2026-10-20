import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDailyModel,refreshDailyModel } from '../automation/daily-read-model.mjs';
test('daily summary contains public minimal fields only and numeric staff hours',()=>{
 const model=buildDailyModel([{id:'e',name:'Test',email:'private-test',password:'secret-test',imageUrl:'large-image',role:'employee',branch:'شرق'}],[{id:'r',rating:'5',date:'20-10-2026',time:'10:00',branch:'شرق',linkedEmployeeIds:['e'],comment:'private-comment',reviewerName:'private-customer'}],[{id:'n',title:'private-note',employees:[{id:'e',name:'Private name'}]}],[{time:'16:00',endTime:'07:00',employees:[{id:'e'}]}]);
 const json=JSON.stringify(model);for(const value of ['private-test','secret-test','large-image','private-comment','private-customer','private-note','Private name'])assert.ok(!json.includes(value));assert.equal(model.hours.e,15);assert.equal(model.reviews.length,1);
});
test('same-day server summary performs one document lookup and no source scan or write',async()=>{
 let calls=0;const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
 const result=await refreshDailyModel(async(path)=>{calls++;assert.ok(path.endsWith(':batchGet'));return[{found:{fields:{dailyReadModel:{mapValue:{fields:{day:{stringValue:day},version:{integerValue:'1'}}}}}}}];});assert.equal(calls,1);assert.equal(result.writes,0);
});
