import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/lib/accountSetup.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {accountSetupEnabled,normalizeUsername,validUsername}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('mandatory setup is limited to the GitHub preview; live builds stay unchanged',()=>{
 assert.equal(accountSetupEnabled('github-pages','shabih11.github.io'),true);
 assert.equal(accountSetupEnabled('github-pages','live.example.invalid'),false);
 assert.equal(accountSetupEnabled('','shabih11.github.io'),false);
 assert.equal(accountSetupEnabled('github-pages','localhost',true),true);
 assert.equal(accountSetupEnabled('github-pages','localhost',false),false);
 assert.equal(accountSetupEnabled('all','live.example.invalid'),true);
});
test('username normalization is deterministic, rejects reserved names and ambiguous input',()=>{
 assert.equal(normalizeUsername('  Nora.12 '),'nora.12');
 for(const valid of ['nora.12','nora_1','nora-1','123'])assert.equal(validUsername(valid),true);
 for(const invalid of ['admin','root','a','a@b.test','a b','نورة','Nora','a'.repeat(33)])assert.equal(validUsername(invalid),false);
});
