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

test('Thursday second shift includes Friday 13:59 and excludes Friday 14:00 in all branches',()=>{
 for (const branch of ['جاليري','القصر','المملكة','شرق','ذافيو','سلام']) {
  const shift={id:'thu',type:'shift',branch,date:'29-10-2026',time:'16:00',endTime:'07:00',endDate:'30-10-2026'};
  const base={branch,rating:'5',linkedEmployeeIds:['e']};
  const reviews=[{...base,id:'before',date:'29-10-2026',time:'15:59'},
   {...base,id:'start',date:'29-10-2026',time:'16:00'},
   {...base,id:'midnight',date:'30-10-2026',time:'00:00'},
   {...base,id:'last',date:'30-10-2026',time:'13:59'},
   {...base,id:'end',date:'30-10-2026',time:'14:00'}];
  assert.equal(shiftReviewCounts(shift,'e',reviews).total,3);
  const friday={...shift,id:'fri',date:'30-10-2026',time:'07:00',endTime:'16:00',endDate:undefined};
  assert.equal(shiftReviewCounts(friday,'e',reviews).total,1);
 }
});
