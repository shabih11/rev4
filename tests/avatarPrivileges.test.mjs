import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { enrichEmployees } = await import(moduleUrl('employeeMetrics'));
const { roundedQualifyingPoints, completeAvatarPoints } = await import(moduleUrl('avatarPrivileges'));
const employee = { id: 'a', role: 'employee', name: 'A', manualStats: { positive: 5, monthReviews: 20 } };
const now = new Date('2026-11-20T12:00:00+03:00');
const review = { id: 'negative', rating: '1', date: '10-11-2026', time: '10:00', linkedEmployeeIds: ['a', 'b'] };
const state = uses => ({ uses, closures: [], purchaseMonths: [], seaReturns: [] });
const erase = { id: 1, period: '2026-11-01', actor: 'c', kind: 'erase', reviewId: 'negative', recipients: ['a', 'b'], gold: true };
test('waiving a shared negative restores only its actual share and remains month scoped', () => {
  assert.equal(enrichEmployees([employee], [review], [], now, true, '')[0].points, 10.75);
  assert.equal(enrichEmployees([employee], [review], [], now, true, '', state([erase]))[0].points, 11);
  assert.equal(enrichEmployees([employee], [review], [], now, true, '', state([{ ...erase, period: '2026-10-01' }]))[0].points, 10.75);
});
test('18 review shares can reach gold through completion without manufacturing reviews or coins', () => {
  const person = { ...employee, manualStats: { positive: 4.5, monthReviews: 18 } };
  const completion = { ...erase, kind: 'complete', targetPoints: 11, reviewId: null };
  const result = enrichEmployees([person], [], [], now, true, '', state([completion]))[0];
  assert.equal(result.points, 11);
  assert.equal(result.monthReviewsCount, 18);
  assert.equal(result.goldPlusCents, 0);
  assert.equal(completeAvatarPoints(10.49, 11), 10.49);
  assert.equal(completeAvatarPoints(10.5, 11), 11);
});
test('general rounding never bridges more than .20 and does not combine with avatar completion', () => {
  assert.equal(roundedQualifyingPoints(10.8, true), 11);
  assert.equal(roundedQualifyingPoints(10.79, true), 10.79);
  assert.equal(roundedQualifyingPoints(7.8, true), 8);
  assert.equal(completeAvatarPoints(10.3, 11), 10.3);
});

test('closed rewards stay frozen when live scores or rounding settings change', async () => {
  const { calculateEmployeeRewards } = await import(moduleUrl('employeeRewards'));
  const frozen = { points: 11, monthReviewsCount: 18, goldPlusCents: 0, tier: 'gold', qualifyingPoints: 11, base: 252, total: 260, increase: 8 };
  const closed = { ...state([]), closures: [{ period: '2026-11-01', snapshot: { a: frozen } }] };
  const result = enrichEmployees([{ ...employee, manualStats: {} }], [], [], now, true, '', closed)[0];
  assert.equal(result.points, 11);
  assert.equal(result.monthReviewsCount, 18);
  for (const rounding of [true, false]) assert.equal(calculateEmployeeRewards([result], rounding).rewards.a.total, 260);
});
