import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/employeeRewards.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { calculateEmployeeRewards, rewardTier } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const employee = (id, points, balance) => ({ id, points, monthReviewsCount: balance });

test('disabled rounding uses actual balances and rates while preserving the 100-riyal minimum', () => {
  const { rewards } = calculateEmployeeRewards([employee('g', 11, 11), employee('s', 8, 8.5), employee('b', 7.1, 20)], false);
  assert.equal(rewards.g.total, 154);
  assert.equal(rewards.s.base, 85);
  assert.equal(rewards.s.total, 100);
  assert.equal(rewards.b.total, 0);
  assert.equal(rewards.s.increase, 15);
});
test('rounding changes category points only, preserving the actual review balance', () => {
  const { rewards } = calculateEmployeeRewards([employee('s', 8, 15.4), employee('g', 10.1, 11)], true);
  assert.equal(rewards.s.tier, 'silver');
  assert.equal(rewards.s.qualifyingPoints, 8);
  assert.equal(rewards.s.base, 154);
  assert.equal(rewards.s.total, 160);
  assert.equal(rewards.g.tier, 'gold');
  assert.equal(rewards.g.base, 154);
  assert.equal(rewardTier(7, true), 'bronze');
  assert.equal(rewardTier(7.1, false), 'bronze');
  assert.equal(rewardTier(8, false), 'silver');
});
test('rounding can grant the minimum reward below eight actual points without a silver badge', () => {
  for (const points of [7.1, 7.5, 7.9, 7.99, 7.999999]) {
    for (const rounding of [false, true]) {
      assert.equal(rewardTier(points, rounding), 'bronze');
      const { rewards } = calculateEmployeeRewards([employee('below', points, 7.5)], rounding);
      assert.equal(rewards.below.tier, 'bronze');
      assert.equal(rewards.below.qualifyingPoints, rounding ? 8 : points);
      assert.equal(rewards.below.base, rounding ? 75 : 0);
      assert.equal(rewards.below.total, rounding ? 100 : 0);
    }
  }
  for (const points of [0, 7]) {
    assert.equal(calculateEmployeeRewards([employee('below', points, 7.5)], true).rewards.below.total, 0);
  }
  assert.equal(rewardTier(8, true), 'silver');
});
test('rounded recipients below eight retain the review-balance minimum and shared uplift rules', () => {
  const { rewards, commonIncrease } = calculateEmployeeRewards([
    employee('below-balance', 7.5, 7), employee('minimum', 7.5, 7.5), employee('gold', 11, 11),
  ], true);
  assert.equal(rewards['below-balance'].total, 0);
  assert.equal(rewards.minimum.tier, 'bronze');
  assert.equal(rewards.minimum.total, 100);
  assert.equal(commonIncrease, 25);
  assert.equal(rewards.gold.total, 170);
});
test('shared uplift is merged before rounding: 85 becomes 100 and 154 becomes 170, not 175 or 180', () => {
  const { rewards, commonIncrease } = calculateEmployeeRewards([employee('low', 8, 8.5), employee('high', 11, 11)], true);
  assert.equal(commonIncrease, 15);
  assert.equal(rewards.low.total, 100);
  assert.equal(rewards.high.total, 170);
  assert.equal(rewards.high.increase, 16);
});
test('minimum uses all recipients, including employees outside the first seven; nonrecipients do not affect it', () => {
  const employees = Array.from({ length: 7 }, (_, i) => employee(`top-${i}`, 11, 20 - i));
  employees.push(employee('eighth', 8, 8.5), employee('bronze', 7, 1), employee('zero', 8, 0));
  const { rewards, commonIncrease } = calculateEmployeeRewards(employees, true);
  assert.equal(commonIncrease, 15);
  assert.equal(rewards.eighth.total, 100);
  assert.equal(rewards['top-0'].total, 300);
  assert.equal(rewards.bronze.total, 0);
  assert.equal(rewards.zero.total, 0);
});
test('every recipient receives at least 100; other uplifts remain capped and in whole tens', () => {
  const { rewards } = calculateEmployeeRewards([employee('low', 8, 7.1), employee('high', 11, 11)], true);
  assert.equal(rewards.low.base, 71);
  assert.equal(rewards.low.total, 100);
  assert.equal(rewards.low.increase, 29);
  assert.equal(rewards.high.total, 170);
  assert.equal(rewards.high.increase, 16);
});
test('rounded recipients get whole tens and at least 100; only the minimum can exceed the cap', () => {
  const employees = Array.from({ length: 250 }, (_, i) => employee(String(i), i % 2 ? 8 : 11, (i + 1) / 10));
  const { rewards } = calculateEmployeeRewards(employees, true);
  for (const reward of Object.values(rewards)) {
    assert.equal(reward.total % 10, 0);
    if (reward.base === 0) { assert.equal(reward.total, 0); continue; }
    assert.ok(reward.total >= 100);
    assert.ok(reward.increase <= 20 || reward.total === 100);
    assert.ok(reward.total >= reward.base);
  }
});
test('a cap with decimal cents is rounded down to a whole ten, never exposed as the final reward', () => {
  const { rewards } = calculateEmployeeRewards([employee('low', 8, 7.1), employee('decimal', 8, 33.22)], true);
  assert.equal(rewards.decimal.base, 332.2);
  assert.equal(rewards.decimal.total, 350);
  assert.equal(rewards.decimal.increase, 17.8);
});
test('the 100-riyal minimum applies even when it requires more than a 20-riyal increase', () => {
  const { rewards } = calculateEmployeeRewards([employee('below', 8, 7.99), employee('edge', 8, 8), employee('above', 8, 8.01)], true);
  assert.equal(rewards.below.total, 100);
  assert.equal(rewards.edge.total, 100);
  assert.equal(rewards.above.total, 100);
});
test('review credit below 7.1 never receives a reward even with silver or gold points', () => {
  for (const rounding of [false, true]) {
    const { rewards } = calculateEmployeeRewards([
      employee('silver-five', 8, 5), employee('gold-seven', 11, 7),
      employee('below-boundary', 11, 7.099), employee('boundary', 8, 7.1),
    ], rounding);
    assert.equal(rewards['silver-five'].total, 0);
    assert.equal(rewards['gold-seven'].total, 0);
    assert.equal(rewards['below-boundary'].total, 0);
    assert.equal(rewards.boundary.total, 100);
  }
});
test('ineligible low balances do not inflate the shared increase for recipients', () => {
  const { rewards, commonIncrease } = calculateEmployeeRewards([employee('excluded', 11, 5), employee('eligible', 11, 11)], true);
  assert.equal(commonIncrease, 0);
  assert.equal(rewards.excluded.total, 0);
  assert.equal(rewards.eligible.total, 160);
});
test('invalid or absent balances and invalid points never generate a reward or distort the shared minimum', () => {
  const employees = [employee('a', NaN, 10), employee('b', 12, 10), employee('c', 8, NaN), employee('d', 8, -1), employee('e', 8, undefined), employee('f', 8, Infinity)];
  const { rewards, commonIncrease } = calculateEmployeeRewards(employees, true);
  assert.equal(commonIncrease, 0);
  assert.ok(Object.values(rewards).every(reward => reward.total === 0));
  assert.deepEqual(calculateEmployeeRewards([], true), { rewards: {}, commonIncrease: 0 });
});
