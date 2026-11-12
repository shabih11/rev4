import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { previousMonthWinnerIds } = await import(moduleUrl('employeeMetrics'));
const users = ['a', 'b'].map(id => ({ id, name: id, role: 'employee', branch: 'test' }));
const reviews = [
  { date: '31-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
  { date: '01-11-2026', rating: '5', linkedEmployeeIds: ['b'] },
  { date: '02-11-2026', rating: '5', linkedEmployeeIds: ['b'] },
];
test('October winner wears crown all November; December uses November winner', () => {
  for (const date of ['2026-11-01T00:00:00+03:00', '2026-11-30T23:59:59+03:00']) {
    assert.deepEqual([...previousMonthWinnerIds(users, reviews, [], new Date(date))], ['a']);
  }
  assert.deepEqual([...previousMonthWinnerIds(users, reviews, [], new Date('2026-12-01T00:00:00+03:00'))], ['b']);
});
test('no crown for empty month; equal positive balances share first place', () => {
  assert.equal(previousMonthWinnerIds(users, [], [], new Date('2026-11-10')).size, 0);
  const shared = [{ date: '31-12-2026', rating: '5', linkedEmployeeIds: ['a', 'b'] }];
  assert.deepEqual([...previousMonthWinnerIds(users, shared, [], new Date('2027-01-01T00:00:00+03:00'))], ['a', 'b']);
});
