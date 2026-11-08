import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { seaMission, seaOpening } = await import(moduleUrl('seaMission'));
const now = Date.parse('2026-11-05T15:00:00+03:00');
const approval = { branch: 'شرق', day: 5, approved_at: new Date(now).toISOString() };
test('manual completion meets the daily target without adding Google reviews', () => {
  const reviews = [];
  const result = seaMission(reviews, now, [approval]);
  const branch = result.branches.find(item => item.name === 'شرق');
  assert.equal(branch.current.count, branch.current.target);
  assert.equal(branch.current.manuallyCompleted, true);
  assert.equal(branch.current.completedAt, now);
  assert.equal(reviews.length, 0);
  assert.equal(result.branches.find(item => item.name === 'سلام').current.count, 0);
});
test('approval persists across day rollover without completing the next day', () => {
  const branch = seaMission([], seaOpening('شرق', 6), [approval]).branches.find(item => item.name === 'شرق');
  assert.equal(branch.status, 'sailing');
  assert.equal(branch.current.count, 0);
  assert.equal(branch.days[0].graceUsed, false);
});
test('late approval resolves a past failure without masking other failures', () => {
  const at = seaOpening('شرق', 7);
  const branch = seaMission([], at, [{ ...approval, approved_at: new Date(at).toISOString() }]).branches.find(item => item.name === 'شرق');
  assert.equal(branch.failedDay.day, 6);
});
test('future and invalid approvals cannot complete an unopened day', () => {
  for (const invalid of [{ ...approval, approved_at: 'invalid' }, { ...approval, approved_at: new Date(now + 60000).toISOString() }, { ...approval, day: 6 }]) {
    const branch = seaMission([], now, [invalid]).branches.find(item => item.name === 'شرق');
    assert.equal(branch.current.count, 0);
  }
});
test('arriving Google reviews do not double the approved target', () => {
  const reviews = [1, 2, 3].map(id => ({ id: String(id), branch: 'شرق', rating: '5', date: '2026-11-05', time: `14:0${id}` }));
  assert.equal(seaMission(reviews, now, [approval]).branches.find(item => item.name === 'شرق').current.count, 3);
});
