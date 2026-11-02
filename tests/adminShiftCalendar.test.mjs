import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dates = { exports: {} };
new Function('require', 'module', 'exports', compile('../src/lib/formatDate.ts'))(require, dates, dates.exports);
function harness(timeline = []) {
  const states = [], added = [], updated = [];
  let cursor = 0;
  const context = { users: [{ id: 'e', name: 'موظفة اختبار', role: 'employee', branch: 'شرق' }], timeline, reviews: [], recordsReady: true, syncError: '', syncStatus: '', branchSettings: { شرق: { start: '16:00', end: '07:00' } }, addTimelineEvent: row => added.push(row), updateTimelineEvent: (...args) => updated.push(args) };
  const calendar = () => null;
  const module = { exports: {} };
  const mocks = { react: { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; } }, '../context/DataContext': { useData: () => context }, './ShiftCalendar': { ShiftCalendar: calendar }, '../lib/formatDate': dates.exports, '../lib/employeeActivity': { reviewTimestamp: () => 0 }, '../lib/employeeBranches': { belongsToBranch: (employee, branch) => employee.branch === branch, isCoverageEmployee: () => false } };
  new Function('require', 'module', 'exports', compile('../src/components/AdminShiftCalendar.tsx'))(name => mocks[name] || require(name), module, module.exports);
  function nodes(node, result = []) { if (Array.isArray(node)) node.forEach(child => nodes(child, result)); else if (node && typeof node === 'object') { result.push(node); nodes(node.props?.children, result); } return result; }
  const render = () => { cursor = 0; return nodes(module.exports.AdminShiftCalendar({ branch: 'شرق' })); };
  const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
  const button = name => render().find(node => node.type === 'button' && text(node) === name);
  const submit = () => render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  render().find(node => node.type === calendar).props.onSelect('27-10-2026');
  return { render, button, submit, context, added, updated };
}
test('admin creates missing first shift with branch hours and selected employees', () => {
  const h = harness();
  h.button('إضافة الشفت الأول').props.onClick();
  h.submit();
  assert.equal(h.added.length, 0);
  assert.ok(h.render().some(node => node.props?.role === 'alert'));
  h.render().find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  h.submit();
  assert.deepEqual(h.added[0], { branch: 'شرق', type: 'shift', title: 'الشفت الأول', date: '27-10-2026', time: '07:00', endTime: '16:00', employees: [{ id: 'e', name: 'موظفة اختبار' }] });
  assert.equal(h.updated.length, 0);
});
test('existing second shift leaves only first addition available and editing still updates', () => {
  const h = harness([{ id: 'existing', type: 'shift', branch: 'شرق', date: '27-10-2026', time: '16:00', endTime: '07:00', employees: [{ id: 'e', name: 'موظفة اختبار' }] }]);
  assert.equal(h.button('إضافة الشفت الثاني'), undefined);
  assert.ok(h.button('إضافة الشفت الأول'));
  h.button('تعديل موظفات الشفت').props.onClick();
  h.submit();
  assert.equal(h.updated[0][0], 'existing');
  assert.equal(h.added.length, 0);
});
test('overnight shift uses next day opening and sync failure prevents saving', () => {
  const h = harness();
  h.button('إضافة الشفت الثاني').props.onClick();
  h.render().find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  h.context.syncError = 'تعذر الاتصال';
  h.submit();
  assert.equal(h.added.length, 0);
  h.context.syncError = '';
  h.submit();
  assert.equal(h.added[0].time, '16:00');
  assert.equal(h.added[0].endTime, '07:00');
});
