import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';

const { enrichEmployees } = await import(moduleUrl('employeeMetrics'));
const { calculateEmployeeScore } = await import(moduleUrl('scoreCalculator'));
const { qualityDeductions } = await import(moduleUrl('employeeQuality'));
const employee = { id: 'e', role: 'employee', branch: 'شرق' };
const now = new Date('2026-11-08T12:00:00+03:00');
function reviews(positive, negative = 0, shared = 1) {
  return Array.from({ length: positive + negative }, (_, index) => ({
    id: `review-${index}`, rating: index < positive ? '5' : '1',
    date: index < positive ? '04-11-2026' : '05-11-2026',
    linkedEmployeeIds: ['e', ...Array.from({ length: shared - 1 }, (_, i) => `other-${i}`)],
  }));
}
function metrics(rows, user = employee, notes = [], cutoff = now) {
  return enrichEmployees([user], rows, notes, cutoff, true, '')[0];
}

test('surplus positives gradually restore two negative reviews without exceeding eleven points', () => {
  for (const [positive, expected] of [[19, 1], [20, 1], [21, 1.125], [24, 1.5], [28, 2], [40, 2]]) {
    const rows = reviews(positive, 2);
    const result = metrics(rows);
    assert.equal(result.stats.positive, Math.min(5, positive * 0.25));
    assert.equal(result.stats.negative, expected);
    assert.equal(result.points, Math.min(5, positive * 0.25) + expected + 4);
    const legacy = calculateEmployeeScore(rows.map(row => ({ rating: Number(row.rating), sharedCount: 1 })), [], []);
    assert.equal(legacy.negative, expected);
    assert.equal(legacy.totalPoints, Number(result.points.toFixed(2)));
  }
});

test('unused surplus offsets later negatives once and is independent of input order', () => {
  const rows = reviews(24, 2);
  const source = structuredClone(rows);
  assert.equal(metrics(rows.slice(0, 24)).points, 11);
  assert.equal(metrics(rows.slice(0, 25)).points, 11);
  assert.equal(metrics(rows).points, 10.5);
  assert.equal(metrics([...rows].reverse()).points, 10.5);
  assert.deepEqual(rows, source);
});

test('shared reviews use fractional balances before rounding and retain all negative debt', () => {
  assert.equal(metrics(reviews(42, 2, 2)).stats.negative, 1.625);
  assert.equal(metrics(reviews(61, 3, 3)).stats.negative.toFixed(6), '1.541667');
  assert.equal(metrics(reviews(28, 6)).stats.negative, 0);
  assert.equal(metrics(reviews(29, 6)).stats.negative, 0.125);
});

test('recovery follows the monthly balance, preserves manual adjustments, and never restores conduct penalties', () => {
  const rows = reviews(24, 1);
  const user = { ...employee, manualStats: { monthReviews: -4, negative: -0.25, positive: 1, complaints: 1, safety: 1 } };
  assert.equal(metrics(rows, user).stats.negative, 1.25);
  assert.equal(metrics(rows, { ...user, manualStats: { ...user.manualStats, monthReviews: 0 } }).stats.negative, 1.75);
  const result = metrics(rows, employee, [{ id: 'complaint', type: 'gap', title: 'شكوى', date: '06-11-2026', employees: [{ id: 'e' }] }]);
  assert.equal(result.stats.negative, 2);
  assert.equal(result.points, 10);
  assert.deepEqual(qualityDeductions(result, rows, [], now), [{ kind: 'conduct-balance', amount: 1 }]);
  assert.equal(metrics(rows, employee, [], new Date('2026-12-08T12:00:00+03:00')).stats.negative, 2);
  assert.equal(metrics([...rows, { ...rows[0], id: 'dec-negative', date: '01-12-2026', rating: '1' }], employee, [], new Date('2026-12-08T12:00:00+03:00')).stats.negative, 1.5);
  assert.equal(metrics([...reviews(20, 2), { ...rows[0], id: 'future', date: '09-11-2026' }]).stats.negative, 1);
});
