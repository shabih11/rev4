import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const modules = new Map();
function moduleUrl(name) {
 if (modules.has(name)) return modules.get(name);
 let code = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 code = code.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${moduleUrl(path.slice(2))}'`);
 const url = 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 modules.set(name,url); return url;
}
const {shiftReviewCounts} = await import(moduleUrl('shiftReviewCounts'));
test('total includes neutral reviews once and excludes other employees, branches and shifts',()=>{
 const shift={id:'s',branch:'a',date:'28-10-2026',time:'09:00',endTime:'16:00'};
 const base={id:'1',branch:'a',date:'28-10-2026',time:'10:00',rating:'5',linkedEmployeeIds:['e'],linkedShiftId:'s'};
 const reviews=[base,base,{...base,id:'2',rating:'3'},{...base,id:'3',rating:'1'},{...base,id:'4',branch:'b'},{...base,id:'5',linkedEmployeeIds:['other']},{...base,id:'6',linkedShiftId:'other'}];
 assert.deepEqual(shiftReviewCounts(shift,'e',reviews),{positive:1,negative:1,total:3});
});
test('unlinked historical reviews use the complete overnight interval with an exclusive end',()=>{
 const shift={id:'s',branch:'a',date:'28-10-2026',time:'16:00',endTime:'02:00',endDate:'29-10-2026'};
 const base={id:'1',branch:'a',date:'29-10-2026',time:'01:00',rating:'3',linkedEmployeeIds:['e']};
 assert.equal(shiftReviewCounts(shift,'e',[base,{...base,id:'2',time:'02:00'},{...base,id:'3',date:'30-10-2026'}]).total,1);
 assert.equal(shiftReviewCounts(shift,'e',[]).total,0);
});
