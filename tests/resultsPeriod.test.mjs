import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const cache = new Map();
function moduleUrl(name) {
  if (cache.has(name)) return cache.get(name);
  let code = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  code = code.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${moduleUrl(path.slice(2))}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  cache.set(name, url);
  return url;
}
const { previousMonthEnd, isOnOrBeforeDate, isInCurrentMonth, recordsThroughDate } = await import(moduleUrl('reviewPeriod'));
const { favoritePartner, weeklyActivity } = await import(moduleUrl('employeeActivity'));
const { qualityDeductions } = await import(moduleUrl('employeeQuality'));
const { latestCoverageBranches } = await import(moduleUrl('employeeBranches'));

test('previous month ends at the final millisecond in Riyadh, including UTC month boundaries', () => {
  for (const [now, expected] of [
    ['2026-11-01T00:00:00+03:00', '2026-10-31T20:59:59.999Z'],
    ['2026-10-31T21:00:00Z', '2026-10-31T20:59:59.999Z'],
    ['2026-10-31T20:59:59Z', '2026-09-30T20:59:59.999Z'],
    ['2027-01-15T12:00:00+03:00', '2026-12-31T20:59:59.999Z'],
    ['2028-03-01T00:00:00+03:00', '2028-02-29T20:59:59.999Z'],
    ['2027-03-01T00:00:00+03:00', '2027-02-28T20:59:59.999Z'],
  ]) assert.equal(previousMonthEnd(new Date(now)).toISOString(), expected);
});

const cutoff = previousMonthEnd(new Date('2026-11-01T00:00:00+03:00'));
test('historical cutoff includes the whole final day and older records, rejects later, missing and invalid dates', () => {
  for (const date of ['31-10-2026', '٣١-١٠-٢٠٢٦', '۳۱-۱۰-۲۰۲۶', '2026-10-31', '30-09-2026']) {
    assert.equal(isOnOrBeforeDate(date, cutoff), true, date);
  }
  for (const date of ['01-11-2026', '01-01-2027', '31-09-2026', '29-02-2026', '', undefined, 'invalid']) {
    assert.equal(isOnOrBeforeDate(date, cutoff), false, String(date));
  }
  assert.equal(isInCurrentMonth('31-10-2026', cutoff), true);
  assert.equal(isInCurrentMonth('30-09-2026', cutoff), false);
  assert.equal(isInCurrentMonth('01-11-2026', cutoff), false);
});

const review = (id, date, ids, rating = '5') => ({ id, date, linkedEmployeeIds: ids, rating, branch: 'test', time: '23:59' });
test('historical partners and chart periods use the selected month and preserve the original rows', () => {
  const rows = [
    review('old', '30-09-2026', ['a', 'c']),
    review('last', '31-10-2026', ['a', 'b']),
    review('new1', '01-11-2026', ['a', 'c']),
    review('new2', '01-11-2026', ['a', 'c']),
  ];
  const visible = recordsThroughDate(rows, cutoff);
  assert.deepEqual(visible.map(row => row.id), ['old', 'last']);
  assert.deepEqual(favoritePartner('a', visible, cutoff), { id: 'b', count: 1 });
  const weeks = weeklyActivity(visible, cutoff);
  assert.equal(weeks.at(-1).end.toISOString(), '2026-10-31T00:00:00.000Z');
  assert.equal(weeks.at(-1).positive, 1);
  assert.deepEqual(favoritePartner('a', rows, new Date('2026-11-01T12:00:00+03:00')), { id: 'c', count: 2 });
  assert.equal(rows.length, 4);
});

test('quality explanations attribute deductions to last-month records using the same reference date', () => {
  const employee = { id: 'a', stats: { negative: 1.5, complaints: 1, safety: 0 } };
  const reviews = [review('negative', '31-10-2026', ['a'], '1'), review('new', '01-11-2026', ['a'], '1')];
  const notes = [{ id: 'note', type: 'gap', title: 'شكوى', date: '31-10-2026', employees: [{ id: 'a' }] }];
  assert.deepEqual(qualityDeductions(employee, reviews, notes, cutoff), [
    { kind: 'review', amount: 0.5, date: '31-10-2026' },
    { kind: 'complaint', amount: 1, date: '31-10-2026' },
  ]);
});

test('coverage employees retain their latest branch at the cutoff rather than a newer shift', () => {
  const shifts = [
    { id: 'new', branch: 'new-branch', occurred_at: '2026-11-01T00:00:00+03:00', employee_ids: ['a'] },
    { id: 'last', branch: 'last-branch', occurred_at: '2026-10-31T23:59:00+03:00', employee_ids: ['a'] },
  ];
  assert.deepEqual(latestCoverageBranches(shifts, ['a'], cutoff.getTime()), { a: 'last-branch' });
});
