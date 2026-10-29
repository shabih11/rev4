import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {generateKeyPair,SignJWT} from 'jose';
import {normalizeRows,importRows} from '../supabase/functions/windsor-import/import.ts';
import {fetchSnapshot} from '../automation/windsor-sync.mjs';
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const plan=url(compile('../src/lib/cloudReadPlan.ts')),cache=url(compile('../src/lib/browserReadCache.ts'));
const recordsCode=compile('../src/lib/supabaseRecords.ts').replace("'./cloudReadPlan'",JSON.stringify(plan)).replace("'./browserReadCache'",JSON.stringify(cache));
const {scopeArguments,rowChanges,loadRows,publicProfile}=await import(url(recordsCode));
const authCode=compile('../supabase/functions/windsor-import/auth.ts').replace("'jose'",JSON.stringify(import.meta.resolve('jose')));
const {verifyGithubToken}=await import(url(authCode));
const admin={id:'a',role:'admin',branch:'one'};
test('read scopes never expand an empty request and keep role constraints',()=>{
 assert.equal(scopeArguments('reviews',{},admin),null);
 assert.deepEqual(scopeArguments('timeline',{all:true},{...admin,role:'manager'}),{source:'timeline',all_rows:true,requested_branches:[],requested_employees:[]});
 assert.deepEqual(scopeArguments('timeline',{branches:['other']},{...admin,role:'employee'}).requested_branches,['other']);
});
test('row changes retain the original baseline and reject duplicate identities',()=>{
 const before=[{id:'a',value:1}],after=[{id:'a',value:2}];
 assert.deepEqual(rowChanges(before,after),[{id:'a',before:before[0],after:after[0]}]);
 assert.deepEqual(rowChanges([{id:'a',x:1,y:2}],[{y:2,id:'a',x:1}]),[]);
 assert.throws(()=>rowChanges([], [{id:'a'},{id:'a'}]));
 assert.deepEqual(publicProfile({id:'a',email:'synthetic@example.invalid',password:'synthetic',mustChangePassword:true,mustSetUsername:true,username:'private.username'}),{id:'a'});
});
test('pagination reads every page and propagates partial failures',async()=>{
 const calls=[],rows=Array.from({length:1201},(_,i)=>({id:String(i)}));
 const client={rpc(){return{range(start,end){calls.push([start,end]);return{async abortSignal(){return{data:rows.slice(start,end+1),error:null};}};}};}};
 assert.equal((await loadRows(client,'reviews',scopeArguments('reviews',{all:true},admin))).length,1201);
 assert.deepEqual(calls,[[0,499],[500,999],[1000,1499]]);
 const failure={rpc(){return{range(){return{async abortSignal(){return{error:{code:'42501'}};}};}};}};
 await assert.rejects(loadRows(failure,'reviews',scopeArguments('reviews',{all:true},admin)),e=>e.code==='42501');
});
const source=(id='synthetic-review')=>({review_id:id,location_id:'locations/3108762223721282674',review_star_rating:'THREE',review_create_time:'2026-10-20T22:30:00Z',review_comment:'synthetic'});
test('source normalization keeps neutral ratings and uses Riyadh dates',()=>{
 const [r]=normalizeRows([source()]);assert.equal(r.rating,'3');assert.equal(r.date,'21-10-2026');assert.equal(r.time,'01:30');
 assert.throws(()=>normalizeRows([{...source(),location_id:'unknown'}]));
 assert.throws(()=>normalizeRows([source(),{...source(),review_star_rating:'ONE'}]));
 assert.equal(normalizeRows([source(),source()]).length,1);
});
test('imports are idempotent and preserve confirmed employee links on source edits',async()=>{
 const rows=new Map();let writes=0;
 const client={from(){return{select(){return{async in(_key,ids){return{data:ids.filter(id=>rows.has(id)).map(id=>({id,data:rows.get(id)}))};}};},async upsert(values){writes++;values.forEach(r=>rows.set(r.id,structuredClone(r.data)));return{};}};}};
 assert.equal((await importRows(client,[source()])).newReviews,1);
 assert.equal((await importRows(client,[source()])).unchangedReviews,1);assert.equal(writes,1);
 rows.get('synthetic-review').linkedEmployeeIds=['synthetic-employee'];rows.get('synthetic-review').linkedShiftId='synthetic-shift';
 assert.equal((await importRows(client,[{...source(),review_comment:'changed'}])).updatedReviews,1);
 assert.deepEqual(rows.get('synthetic-review').linkedEmployeeIds,['synthetic-employee']);assert.equal(rows.get('synthetic-review').linkedShiftId,'synthetic-shift');
 const previous=writes;await assert.rejects(importRows(client,[source('new'),{review_id:'bad'}]));assert.equal(writes,previous);
});
test('Windsor errors cannot echo a credential-bearing URL',async()=>{
 await assert.rejects(fetchSnapshot('synthetic-key','2026-08-01','2026-10-21',async url=>{throw Error(String(url));}),{message:'Windsor connection failed'});
 await assert.rejects(fetchSnapshot('synthetic-key','2026-08-01','2026-10-21',async()=>({ok:true,json:async()=>({status:'done',data:[source()],total_rows:2})})),{message:'Incomplete Windsor response'});
});
const {privateKey,publicKey}=await generateKeyPair('RS256');
const claims={repository:'shabih11/rev4',ref:'refs/heads/codex/supabase-production',event_name:'push',workflow_ref:'shabih11/rev4/.github/workflows/windsor-sync.yml@refs/heads/codex/supabase-production'};
const sign=(extra={},audience='rev4-windsor-supabase',expires='5m')=>new SignJWT({...claims,...extra}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(audience).setIssuedAt().setExpirationTime(expires).sign(privateKey);
test('OIDC accepts only the trusted repository, branch, workflow and audience',async()=>{
 assert.equal((await verifyGithubToken(await sign(),async()=>publicKey)).repository,'shabih11/rev4');
 for(const extra of [{repository:'attacker/rev4'},{ref:'refs/pull/1/merge'},{event_name:'pull_request'},{workflow_ref:'shabih11/rev4/other.yml@refs/heads/codex/supabase-production'}])await assert.rejects(verifyGithubToken(await sign(extra),async()=>publicKey));
 await assert.rejects(verifyGithubToken(await sign({},'wrong-audience'),async()=>publicKey));
 await assert.rejects(verifyGithubToken(await sign({},'rev4-windsor-supabase','-1m'),async()=>publicKey));
 const wrong=await generateKeyPair('RS256');await assert.rejects(verifyGithubToken(await sign(),async()=>wrong.publicKey));
});

const {normalizeLoginEmail,normalizeLoginPassword}=await import(url(compile('../src/lib/loginInput.ts')));
test('admin username is normalized without changing arbitrary passwords',()=>{
 assert.equal(normalizeLoginEmail(' \u200fADMIN '),'admin@rev4.local');
 assert.equal(normalizeLoginEmail(' user@example.invalid '),'user@example.invalid');
 assert.equal(normalizeLoginPassword(' Strong ٠Password '),' Strong ٠Password ');
});
