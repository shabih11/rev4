import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/employeeFeatures.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { defaultFeatures, employeeTier, allowedAccessories, validFeatureSettings, dailyProgress } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const enabled = { ...defaultFeatures, tiers: true };
test('tier boundaries and disabled tiers preserve bronze', () => {
  assert.equal(employeeTier(7.99, enabled), 'bronze');
  assert.equal(employeeTier(8, enabled), 'silver');
  assert.equal(employeeTier(10.99, enabled), 'silver');
  assert.equal(employeeTier(11, enabled), 'gold');
  assert.equal(employeeTier(11, defaultFeatures), 'bronze');
  assert.equal(employeeTier(NaN, enabled), 'bronze');
  assert.equal(employeeTier(9, { ...enabled, silverAt: 9, goldAt: 10 }), 'silver');
  assert.deepEqual(allowedAccessories('bronze'), []);
  assert.deepEqual(allowedAccessories('silver'), ['shawl', 'brooch']);
  assert.deepEqual(allowedAccessories('gold'), ['shawl', 'brooch', 'veil']);
});
test('invalid thresholds and malformed flags are rejected', () => {
  assert.equal(validFeatureSettings(enabled), true);
  for (const change of [{ silverAt: 11 }, { goldAt: 12 }, { silverAt: 0 }, { silverAt: NaN }, { tiers: 'true' }, { goldAt: null }]) assert.equal(validFeatureSettings({ ...enabled, ...change }), false);
});
test('daily comparison requires a baseline and a strict crossing; ties and new employees do not count', () => {
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 5.4 }, { id: 'b', name: 'B', monthReviewsCount: 5 }, { id: 'c', name: 'C', monthReviewsCount: 5.4 }, { id: 'd', name: 'D', monthReviewsCount: 4 }, { id: 'new', name: 'New', monthReviewsCount: 0 }];
  const state = { baseline: { a: 4, b: 5, c: 6, d: 4 }, settings: enabled };
  assert.deepEqual(dailyProgress(employees[0], employees, state), { growth: 1.4, overtaken: ['B'] });
  assert.deepEqual(dailyProgress(employees[0], employees, null), { growth: 0, overtaken: [] });
  assert.deepEqual(dailyProgress(employees[4], employees, state), { growth: 0, overtaken: [] });
  assert.equal(dailyProgress({ id: 'a', monthReviewsCount: 3 }, employees, state).growth, -1);
});
