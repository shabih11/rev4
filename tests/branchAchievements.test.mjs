import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { rocketLaunchBranches, sundayCoffeeWinner } = await import(moduleUrl('reviewPeriod'));
const rows = (count, date, branch = 'جاليري') => Array.from({ length: count }, () => ({ date, branch }));

test('rocket badge needs 100 reviews in an inclusive seven-day window after July, excluding future records', () => {
  assert.deepEqual([...rocketLaunchBranches([...rows(50,'01-07-2026'),...rows(50,'07-07-2026')],'2026-07-07')], ['جاليري']);
  assert.equal(rocketLaunchBranches([...rows(50,'01-07-2026'),...rows(50,'08-07-2026')],'2026-07-08').size, 0);
  assert.equal(rocketLaunchBranches([...rows(100,'30-06-2026'),...rows(100,'09-07-2026')],'2026-07-08').size, 0);
  assert.equal(rocketLaunchBranches([...rows(60,'01-07-2026'),...rows(60,'01-07-2026','شرق')],'2026-07-08').size, 0);
});

test('Sunday coffee badge selects unique leader for November 5–7 and withholds ties', () => {
  const input = [...rows(3,'05-11-2026'),...rows(2,'07-11-2026','شرق'),...rows(100,'08-11-2026','شرق')];
  assert.equal(sundayCoffeeWinner(input),'جاليري');
  assert.equal(sundayCoffeeWinner([...input,...rows(1,'06-11-2026','شرق')]),null);
  assert.equal(sundayCoffeeWinner([...input,...rows(2,'06-11-2026','شرق')]),'شرق');
  assert.equal(sundayCoffeeWinner(rows(100,'31-11-2026')),null);
  assert.equal(sundayCoffeeWinner([]),null);
});
