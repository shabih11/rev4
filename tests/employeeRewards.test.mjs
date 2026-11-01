import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/employeeRewards.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { calculateEmployeeRewards, rewardTier } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const employee = (id, points, balance) => ({ id, points, monthReviewsCount: balance });

test('disabled rounding pays exact actual review balances, at 14 for gold and 10 for silver', () => {
  const { rewards } = calculateEmployeeRewards([employee('g', 11, 11), employee('s', 8, 8.5), employee('b', 7.1, 20)], false);
  assert.equal(rewards.g.total, 154);
  assert.equal(rewards.s.total, 85);
  assert.equal(rewards.b.total, 0);
  assert.equal(rewards.s.increase, 0);
});
test('rounding changes category points only, preserving the actual review balance', () => {
  const { rewards } = calculateEmployeeRewards([employee('s', 7.1, 15.4), employee('g', 10.1, 11)], true);
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
test('the cap takes priority over the minimum; unequal increases still end in whole tens', () => {
  const { rewards } = calculateEmployeeRewards([employee('low', 7.1, 7.1), employee('high', 11, 11)], true);
  assert.equal(rewards.low.base, 71);
  assert.equal(rewards.low.total, 90);
  assert.equal(rewards.low.increase, 19);
  assert.equal(rewards.high.total, 170);
  assert.equal(rewards.high.increase, 16);
});
test('every rounded payout is a multiple of ten with an increase no greater than twenty', () => {
  const employees = Array.from({ length: 250 }, (_, i) => employee(String(i), i % 2 ? 8 : 11, (i + 1) / 10));
  const { rewards } = calculateEmployeeRewards(employees, true);
  for (const reward of Object.values(rewards)) {
    assert.equal(reward.total % 10, 0);
    assert.ok(reward.increase <= 20);
    assert.ok(reward.total >= reward.base);
  }
});
test('a cap with decimal cents is rounded down to a whole ten, never exposed as the final reward', () => {
  const { rewards } = calculateEmployeeRewards([employee('low', 7.1, 7.1), employee('decimal', 8, 33.22)], true);
  assert.equal(rewards.decimal.base, 332.2);
  assert.equal(rewards.decimal.total, 350);
  assert.equal(rewards.decimal.increase, 17.8);
});
test('the 100-riyal target is reached only when compatible with the cap and whole tens', () => {
  const { rewards } = calculateEmployeeRewards([employee('below', 8, 7.99), employee('edge', 8, 8), employee('above', 8, 8.01)], true);
  assert.equal(rewards.below.total, 90);
  assert.equal(rewards.edge.total, 100);
  assert.equal(rewards.above.total, 100);
});
test('invalid or absent balances and invalid points never generate a reward or distort the shared minimum', () => {
  const employees = [employee('a', NaN, 10), employee('b', 12, 10), employee('c', 8, NaN), employee('d', 8, -1), employee('e', 8, undefined), employee('f', 8, Infinity)];
  const { rewards, commonIncrease } = calculateEmployeeRewards(employees, true);
  assert.equal(commonIncrease, 0);
  assert.ok(Object.values(rewards).every(reward => reward.total === 0));
  assert.deepEqual(calculateEmployeeRewards([], true), { rewards: {}, commonIncrease: 0 });
});
