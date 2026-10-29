import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/employeeBranches.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { isCoverageEmployee, latestCoverageBranches, employeeReviewBranches, belongsToBranch, employeeBranchLabel, leaderboardEmployee } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = Date.parse('2026-10-25T12:00:00+03:00');
test('coverage follows the latest started shift, ignoring future shifts and unrelated employees', () => {
  const shifts = [
    { id: 'a', branch: 'أ', occurred_at: '2026-10-24T08:00:00+03:00', employee_ids: ['employee'] },
    { id: 'b', branch: 'ب', occurred_at: '2026-10-25T08:00:00+03:00', employee_ids: ['employee', 'other'] },
    { id: 'c', branch: 'ج', occurred_at: '2026-10-26T08:00:00+03:00', employee_ids: ['employee'] },
    { id: 'd', branch: 'د', occurred_at: '2026-10-25T10:00:00+03:00', employee_ids: ['other'] },
    { id: 'e', branch: 'هـ', occurred_at: 'invalid', employee_ids: ['employee'] },
  ];
  assert.deepEqual(latestCoverageBranches(shifts, ['employee', 'missing'], now), { employee: 'ب' });
  assert.deepEqual(latestCoverageBranches([...shifts].reverse(), ['employee'], now), { employee: 'ب' });
});
test('equal timestamps resolve deterministically; a shift starting now is included', () => {
  const shifts = ['a', 'b'].map(id => ({ id, branch: id, occurred_at: new Date(now).toISOString(), employee_ids: ['employee'] }));
  assert.deepEqual(latestCoverageBranches(shifts, ['employee'], now), { employee: 'b' });
  assert.deepEqual(latestCoverageBranches(shifts.reverse(), ['employee'], now), { employee: 'b' });
});
test('coverage affiliation does not treat historical branches as current', () => {
  const employee = { branch: 'جديد', assignedBranches: ['قديم'], isCoverage: true };
  assert.equal(belongsToBranch(employee, 'جديد'), false);
  assert.equal(belongsToBranch(employee, 'قديم'), false);
  assert.equal(isCoverageEmployee({ branch: 'موظفة خارجية' }), false);
  assert.equal(isCoverageEmployee({ branch: 'جديد', assignedBranches: ['قديم'] }), false);
  assert.equal(isCoverageEmployee({ ...employee, isCoverage: false }), false);
  assert.equal(belongsToBranch({ ...employee, isCoverage: false }, 'قديم'), false);
});
test('branch badges depend on the employee own review history, not other employees', () => {
  const reviews = [
    { branch: ' أ ', linkedEmployeeIds: ['employee'] },
    { branch: 'أ', linkedEmployeeIds: ['employee'] },
    { branch: 'ب', linkedEmployeeIds: ['other'] },
    { branch: '', linkedEmployeeIds: ['employee'] },
  ];
  assert.deepEqual(employeeReviewBranches(reviews, 'employee'), ['أ']);
  assert.deepEqual(employeeReviewBranches([...reviews, { branch: 'ب', linkedEmployeeIds: ['employee', 'other'] }], 'employee'), ['أ', 'ب']);
});

test('only explicit coverage flags qualify; management sees a tag and leaderboard gets the latest branch',()=>{
 const employee={id:'e',branch:'أصلي',assignedBranches:['آخر'],isCoverage:true};
 assert.equal(isCoverageEmployee(employee),true);
 assert.equal(employeeBranchLabel(employee),'موظفة متنقلة');
 const ranked=leaderboardEmployee(employee,{e:'الأحدث'});
 assert.equal(employeeBranchLabel(ranked,true),'الأحدث');
 assert.equal(employee.branch,'أصلي');
 assert.equal(leaderboardEmployee(employee,{}).branch,'موظفة متنقلة');
 assert.equal(isCoverageEmployee({...employee,isCoverage:false}),false);
 assert.equal(isCoverageEmployee({branch:'موظفة خارجية',assignedBranches:['آخر']}),false);
});

 test('a fixed employee belongs only to her current branch even with historical assignments', () => {
  const employee = { branch: 'سلام', assignedBranches: ['سلام', 'جاليري'], isCoverage: false };
  assert.equal(belongsToBranch(employee, 'سلام'), true);
  assert.equal(belongsToBranch(employee, 'جاليري'), false);
  assert.equal(belongsToBranch({ ...employee, branch: 'جاليري' }, 'سلام'), false);
  assert.equal(belongsToBranch({ ...employee, isCoverage: true }, 'سلام'), false);
 });
