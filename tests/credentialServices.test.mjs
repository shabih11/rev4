import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
let handler,role,authenticated,defaultPassword,usernameError,serviceError,registrationExists,registrationSaveError,updated,created,deleted,calls,loginEmail;
const defaultValue='test-only-default';
const caller={auth:{getUser:async()=>({data:{user:authenticated?{id:'verified-caller',email:'caller@example.invalid',user_metadata:{role:'admin'}}:null}})},rpc:async(name,args)=>{
 calls.push([name,args]);
 if(name==='get_my_account')return {data:{id:'caller',role,branch:'سلام',mustChangePassword:defaultPassword,mustSetUsername:true}};
 if(name==='set_my_username')return usernameError?{error:{code:'23505'}}:{};
 return {};
}};
const admin={auth:{admin:{updateUserById:async(...args)=>{updated.push(args);return {};},createUser:async(args)=>{created.push(args);return {data:{user:{id:'new-employee'}}};},deleteUser:async(id)=>{deleted.push(id);return {};}}},rpc:async(name,args)=>{
 calls.push([name,args]);
 if(name==='resolve_username_login')return serviceError?{error:{code:'54000'}}:{data:'private@example.invalid'};
 if(name==='employee_default_password')return {data:defaultValue};
 if(name==='branch_registration_exists')return {data:registrationExists};
 if(name==='complete_branch_registration')return registrationSaveError?{error:{code:'42501'}}:{};
 return {};
}};
const login={auth:{signInWithPassword:async(args)=>{loginEmail=args.email;return {data:{session:{access_token:'synthetic-access',refresh_token:'synthetic-refresh'}}};},signOut:async()=>({})},rpc:caller.rpc};
globalThis.__credentialClient=(_url,key,options)=>key==='service'?admin:options?.global?caller:login;
globalThis.Deno={env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'service':'public'},serve:fn=>{handler=fn;}};
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const shared=readFileSync(new URL('../supabase/functions/_shared/account.ts',import.meta.url),'utf8').replace(/import \{ createClient \} from '[^']+';/,'const createClient=globalThis.__credentialClient;');
globalThis.__credentialShared=await import('data:text/javascript;base64,'+Buffer.from(compile(shared)).toString('base64'));
const handlers={};
for(const name of ['account-login','account-setup','employee-register']){
 const source=readFileSync(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8').replace(/import \{([^}]+)\} from '[^']+';/,'const {$1}=globalThis.__credentialShared;');
 await import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));handlers[name]=handler;
}
const reset=()=>{role='employee';authenticated=true;defaultPassword=true;usernameError=false;serviceError=false;registrationExists=false;registrationSaveError=false;updated=[];created=[];deleted=[];calls=[];loginEmail='';};
const request=(body,auth=true)=>new Request('https://test.invalid/service',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer synthetic-session'}:{})},body:JSON.stringify(body)});
test('username login returns session tokens without disclosing the resolved email',async()=>{
 reset();const response=await handlers['account-login'](request({username:' Test.User ',password:'secret-test'},false));
 assert.equal(response.status,200);assert.equal(loginEmail,'private@example.invalid');
 const text=await response.text();assert.equal(text.includes('example.invalid'),false);assert.equal(text.includes('secret-test'),false);
 assert.deepEqual(JSON.parse(text),{access_token:'synthetic-access',refresh_token:'synthetic-refresh'});
 serviceError=true;assert.equal((await handlers['account-login'](request({username:'test.user',password:'secret-test'},false))).status,429);
});
test('setup requires verified membership and rejects default passwords and occupied names',async()=>{
 reset();assert.equal((await handlers['account-setup'](request({username:'test.user',password:'new-pass-123'},false))).status,401);
 authenticated=false;assert.equal((await handlers['account-setup'](request({username:'test.user',password:'new-pass-123'}))).status,401);
 authenticated=true;assert.equal((await handlers['account-setup'](request({username:'test.user',password:defaultValue}))).status,400);
 usernameError=true;assert.equal((await handlers['account-setup'](request({username:'test.user',password:'new-pass-123'}))).status,409);
 assert.equal(updated.length,0);
});
test('setup changes only the verified caller, revokes old sessions and never echoes a password',async()=>{
 reset();const response=await handlers['account-setup'](request({username:'test.user',password:'new-pass-123',targetUid:'forged-target'}));
 assert.equal(response.status,200);assert.deepEqual(updated,[['verified-caller',{password:'new-pass-123'}]]);
 assert.deepEqual(calls.find(([name])=>name==='finish_self_account_setup')[1],{target_uid:'verified-caller'});
 assert.equal((await response.text()).includes('new-pass-123'),false);
 reset();defaultPassword=false;assert.equal((await handlers['account-setup'](request({username:'test.user'}))).status,200);assert.equal(updated.length,0);
});
test('only branch managers register accounts, and submitted branch and role cannot override membership',async()=>{
 reset();const body={name:'Test employee',requestId:'00000000-0000-4000-8000-000000000006',branch:'جاليري',role:'admin'};
 assert.equal((await handlers['employee-register'](request(body))).status,403);assert.equal(created.length,0);
 role='manager';const response=await handlers['employee-register'](request(body));assert.equal(response.status,200);
 assert.equal(created[0].email.startsWith('salam.emp.'),true);assert.equal(created[0].password,defaultValue);
 const args=calls.find(([name])=>name==='complete_branch_registration')[1];assert.equal(args.actor_uid,'verified-caller');assert.equal(args.expected_branch,'سلام');
 assert.equal((await response.text()).includes('@'),false);
});
test('registration retries are idempotent and failed saves clean up only unlinked accounts',async()=>{
 reset();role='manager';registrationExists=true;const body={name:'Test employee',requestId:'00000000-0000-4000-8000-000000000006'};
 assert.equal((await handlers['employee-register'](request(body))).status,200);assert.equal(created.length,0);
 reset();role='manager';registrationSaveError=true;assert.equal((await handlers['employee-register'](request(body))).status,503);assert.deepEqual(deleted,['new-employee']);
});
test('oversized requests and reserved usernames cannot reach credential mutations',async()=>{
 reset();assert.equal((await handlers['account-setup'](request({username:'admin',password:'new-pass-123'}))).status,400);
 assert.equal((await handlers['account-setup'](request({username:'test.user',password:'x'.repeat(5000)}))).status,400);assert.equal(updated.length,0);
});
