import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url), cache=new Map();
function load(path) {
 if(cache.has(path))return cache.get(path).exports;
 const module={exports:{}};cache.set(path,module);
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=name=>{if(!name.startsWith('.'))return require(name);const base=resolve(dirname(path),name);return load(['.ts','.tsx'].map(extension=>base+extension).find(existsSync));};
 new Function('require','module','exports',code)(localRequire,module,module.exports);
 return module.exports;
}
const {ShiftCalendar}=load(fileURLToPath(new URL('../src/components/ShiftCalendar.tsx',import.meta.url)));
const now=new Date(), month=String(now.getMonth()+1).padStart(2,'0'), year=now.getFullYear();
const date=`01-${month}-${year}`;
const shifts=[{id:'a',date,time:'09:00',employees:[{id:'e'}]},{id:'b',date,time:'16:00',employees:[{id:'e'}]}];
function dayButton(props){const html=renderToStaticMarkup(createElement(ShiftCalendar,{shifts,onSelect(){},...props}));return html.match(/<button[^>]*><span[^>]*>1<\/span>[\s\S]*?<\/button>/)[0];}
test('unlinked date takes blue priority while keeping two-shift label',()=>{
 const button=dayButton({unlinkedReviewDates:[`${year}-${month}-01`]});
 assert.match(button,/bg-blue-600/);assert.match(button,/شفتين/);assert.doesNotMatch(button,/bg-emerald/);
});
test('unrelated date leaves shift colors unchanged and removing unlinked date restores green',()=>{
 assert.match(dayButton({unlinkedReviewDates:[`02-${month}-${year}`]}),/bg-emerald-500/);
 assert.match(dayButton({unlinkedReviewDates:[]}),/bg-emerald-500/);
});
test('a day without a recorded shift still highlights an unlinked review',()=>{
 const button=dayButton({shifts:[],unlinkedReviewDates:[date]});
 assert.match(button,/bg-blue-600/);assert.match(button,/—/);
});
test('employee days are dark green for either one or two shifts',()=>{
 assert.match(dayButton({highlightEmployeeId:'e'}),/bg-emerald-700/);
 assert.match(dayButton({highlightEmployeeId:'e',shifts:[shifts[0]]}),/bg-emerald-700/);
});
test('other employees shifts stay light in the personal calendar',()=>{
 const button=dayButton({highlightEmployeeId:'other'});
 assert.match(button,/bg-emerald-100/);
 assert.doesNotMatch(button,/bg-emerald-700|bg-emerald-500/);
});

test('personal current-month calendar keeps day buttons but hides month navigation',()=>{
 const html=renderToStaticMarkup(createElement(ShiftCalendar,{shifts,onSelect(){},highlightEmployeeId:'e',showMonthNavigation:false}));
 assert.doesNotMatch(html,/الشهر السابق|الشهر التالي/);
 assert.match(html,/تقويم شفتات الفرع/);
 assert.match(html,/bg-emerald-700/);
 assert.match(html,/>1<\/span>/);
});
