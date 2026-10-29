import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function moduleUrl(name) {
 if(modules.has(name))return modules.get(name);
 let code=ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 code=code.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${moduleUrl(path.slice(2))}'`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
const {employeeQualityPoints,qualityDeductions}=await import(moduleUrl('employeeQuality'));

test('quality combines the existing two-point review credit and four-point conduct credit',()=>{
 const stats={positive:0.3,negative:2,complaints:0,safety:0};
 assert.equal(employeeQualityPoints(stats),6);
 assert.equal(stats.positive+employeeQualityPoints(stats),6.3);
 assert.deepEqual(stats,{positive:0.3,negative:2,complaints:0,safety:0});
 assert.equal(employeeQualityPoints({...stats,negative:1.5,complaints:1,safety:0.5}),4);
});
test('quality preserves the zero floor on conduct credit and remains within six points',()=>{
 assert.equal(employeeQualityPoints({positive:0,negative:0,complaints:4,safety:0}),0);
 assert.equal(employeeQualityPoints({positive:0,negative:2,complaints:3,safety:2}),2);
 assert.equal(employeeQualityPoints({positive:0,negative:2,complaints:0,safety:0}),6);
});

const now=new Date('2026-10-29T12:00:00+03:00');
const employee={id:'e',stats:{positive:0.3,negative:1.75,complaints:0,safety:0}};
const review={id:'r',date:'26-10-2026',rating:'2',linkedEmployeeIds:['e','other']};
test('a shared lower rating explains its quarter-point loss on the recorded date',()=>{
 const rows=[review,review,{...review,id:'old',date:'26-09-2026'},{...review,id:'future',date:'30-10-2026'},{...review,id:'other',linkedEmployeeIds:['other']},{...review,id:'positive',rating:'5'}];
 assert.deepEqual(qualityDeductions(employee,rows,[],now),[{kind:'review',amount:0.25,date:'26-10-2026'}]);
});
test('confirmed complaints and safety notes explain separate recorded losses',()=>{
 const target={...employee,stats:{...employee.stats,negative:2,complaints:1,safety:1}};
 const notes=[{id:'a',type:'gap',date:'25-10-2026',title:'شكوى عميل',employees:[{id:'e'}]},{id:'b',type:'gap',date:'26-10-2026',title:'مخالفة سلامة',employees:[{id:'e'}]}];
 assert.deepEqual(qualityDeductions(target,[],[...notes,notes[0]],now),[{kind:'complaint',amount:1,date:'25-10-2026'},{kind:'safety',amount:1,date:'26-10-2026'}]);
});
test('missing records or adjusted balances never invent a dated attribution',()=>{
 assert.deepEqual(qualityDeductions(employee,[],[],now),[{kind:'review-balance',amount:0.25}]);
 assert.deepEqual(qualityDeductions({...employee,stats:{...employee.stats,negative:1.5}},[review],[],now),[{kind:'review-balance',amount:0.5}]);
 assert.deepEqual(qualityDeductions({...employee,stats:{...employee.stats,negative:2}},[review],[],now),[]);
});
