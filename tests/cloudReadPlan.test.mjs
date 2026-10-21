import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/cloudReadPlan.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { combineRecordScopes, recordFilters } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const admin = { id: 'test-admin', branch: 'test-branch', role: 'admin' };

test('no open detail screen produces no detail query; empty input never causes a full scan', () => {
  assert.equal(combineRecordScopes([]), null);
  assert.equal(combineRecordScopes([{}, { branches: [''], employeeIds: [] }]), null);
  assert.equal(recordFilters('reviews', null, admin), null);
  assert.equal(recordFilters('reviews', {}, admin), null);
});

test('overlapping screens share a deterministic union without dropping either result set', () => {
  const scope = combineRecordScopes([{ branches: ['b', 'a'] }, { branches: ['a'], employeeIds: ['e2', 'e1', 'e1'] }]);
  assert.deepEqual(scope, { branches: ['a', 'b'], employeeIds: ['e1', 'e2'] });
  assert.deepEqual(recordFilters('reviews', scope, admin), [
    { field: 'branch', op: 'in', value: ['a', 'b'] },
    { field: 'linkedEmployeeIds', op: 'array-contains-any', value: ['e1', 'e2'] },
  ]);
});

test('complete maintenance view overrides narrowed requests', () => {
  assert.deepEqual(combineRecordScopes([{ branches: ['a'] }, { all: true }]), { all: true });
  assert.deepEqual(recordFilters('reviews', { all: true }, admin), []);
});

test('timeline queries always retain the existing server authorization constraints', () => {
  assert.deepEqual(recordFilters('timeline', { all: true }, { ...admin, role: 'manager' }), [
    { field: 'branch', op: '==', value: 'test-branch' },
  ]);
  assert.deepEqual(recordFilters('timeline', { branches: ['other-branch'] }, { ...admin, role: 'employee' }), [
    { field: 'employeeIds', op: 'array-contains', value: 'test-admin' },
  ]);
  assert.equal(recordFilters('timeline', null, { ...admin, role: 'employee' }), null);
});

test('query limits fail explicitly instead of returning incomplete data or scanning all records', () => {
  assert.throws(() => recordFilters('reviews', { employeeIds: Array.from({ length: 31 }, (_, i) => `test-${i}`) }, admin));
});
