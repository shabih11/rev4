import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/employeeFeatures.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { defaultFeatures, employeeTier, validFeatureSettings, dailyProgress, comparisonFromRecords, riyadhDay } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const enabled = { ...defaultFeatures, tiers: true };
test('tier boundaries and disabled tiers preserve bronze', () => {
  assert.equal(employeeTier(7.99, enabled), 'bronze');
  assert.equal(employeeTier(8, enabled), 'silver');
  assert.equal(employeeTier(10.99, enabled), 'silver');
  assert.equal(employeeTier(11, enabled), 'gold');
  assert.equal(employeeTier(11, defaultFeatures), 'bronze');
  assert.equal(employeeTier(NaN, enabled), 'bronze');
  assert.equal(employeeTier(9, { ...enabled, silverAt: 9, goldAt: 10 }), 'silver');
});
test('invalid thresholds and malformed flags are rejected', () => {
  assert.equal(validFeatureSettings(enabled), true);
  for (const change of [{ silverAt: 11 }, { goldAt: 12 }, { silverAt: 0 }, { silverAt: NaN }, { tiers: 'true' }, { goldAt: null }]) assert.equal(validFeatureSettings({ ...enabled, ...change }), false);
});
test('daily comparison uses leaderboard tie-breaks and ignores employees without a baseline', () => {
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 5.4 }, { id: 'b', name: 'B', monthReviewsCount: 5 }, { id: 'c', name: 'C', monthReviewsCount: 5.4 }, { id: 'd', name: 'D', monthReviewsCount: 4 }, { id: 'new', name: 'New', monthReviewsCount: 0 }];
  const state = { baseline: { a: 4, b: 5, c: 6, d: 4 }, settings: enabled };
  assert.deepEqual(dailyProgress(employees[0], employees, state), { growth: 1.4, rankGain: 2, overtaken: ['C', 'B'] });
  assert.deepEqual(dailyProgress(employees[0], employees, null), { growth: 0, rankGain: 0, overtaken: [] });
  assert.deepEqual(dailyProgress(employees[4], employees, state), { growth: 0, rankGain: 0, overtaken: [] });
  assert.equal(dailyProgress({ id: 'a', monthReviewsCount: 3 }, employees, state).growth, -1);
});

test('comparison reconstructs yesterday from present records without a saved snapshot', () => {
  const now = new Date('2026-10-24T18:00:00Z');
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 2, manualStats: { monthReviews: .5 } }, { id: 'b', name: 'B', monthReviewsCount: 1 }];
  const reviews = [
    { date: '٢٣-١٠-٢٠٢٦', rating: '5', linkedEmployeeIds: ['a','b'] },
    { date: '24-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
    { date: '23-10-2026', rating: '3', linkedEmployeeIds: ['a'] },
    { date: '23-09-2026', rating: '5', linkedEmployeeIds: ['a'] },
    { date: '25-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
    { date: '31-02-2026', rating: '5', linkedEmployeeIds: ['a'] },
  ];
  const state = comparisonFromRecords({ settings: enabled, baselineDay: null, baseline: {} }, employees, reviews, now);
  assert.deepEqual(state.baseline, { a: 1, b: .5 });
  assert.equal(state.comparisonSource, 'records');
  assert.equal(dailyProgress(employees[0], employees, state).growth, 1);
  assert.equal(comparisonFromRecords(null, employees, reviews, now), null);
  const midnight = comparisonFromRecords(state, employees, reviews, new Date('2026-10-31T21:01:00Z'));
  assert.deepEqual(midnight.baseline, { a: .5, b: 0 });
  assert.equal(riyadhDay(new Date('2026-10-24T21:00:00Z')), '2026-10-25');
});

test('an actual daily snapshot preserves retroactive changes; stale snapshots reconstruct from records', () => {
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 3 }];
  const saved = { settings: enabled, comparisonSource: 'snapshot', baselineDay: '2026-10-24', baseline: { a: 1 } };
  assert.equal(comparisonFromRecords(saved, employees, [], new Date('2026-10-24T12:00:00Z')), saved);
  assert.deepEqual(comparisonFromRecords(saved, employees, [], new Date('2026-10-25T12:00:00Z')).baseline, { a: 0 });
});

test('new employees ahead of the current employee count toward the current rank', () => {
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 8 }, { id: 'b', name: 'B', monthReviewsCount: 7 }, { id: 'new', name: 'New', monthReviewsCount: 9 }];
  const progress = dailyProgress(employees[0], employees, { settings: enabled, baseline: { a: 3, b: 7 } });
  assert.equal(progress.rankGain, 0);
  assert.deepEqual(progress.overtaken, ['B']);
});

test('daily progress survives midnight, quiet days and reloads until new review activity', () => {
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 3 }, { id: 'b', name: 'B', monthReviewsCount: 2 }];
  const reviews = [
    { date: '25-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
    { date: '25-10-2026', rating: '5', linkedEmployeeIds: ['b'] },
    { date: '25-10-2026', rating: '5', linkedEmployeeIds: ['b'] },
    { date: '26-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
    { date: '26-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
    { date: '27-10-2026', rating: '5', linkedEmployeeIds: [] },
    { date: '30-10-2026', rating: '5', linkedEmployeeIds: ['a'] },
  ];
  // A newly captured midnight baseline must not erase the previous update's gains.
  const snapshot = { settings: enabled, comparisonSource: 'snapshot', baselineDay: '2026-10-27', baseline: { a: 3, b: 2 } };
  for (const time of ['2026-10-26T21:01:00Z', '2026-10-27T18:00:00Z', '2026-10-28T12:00:00Z']) {
    const state = comparisonFromRecords(snapshot, employees, reviews, new Date(time));
    assert.equal(state.baselineDay, '2026-10-26');
    assert.deepEqual(dailyProgress(employees[0], employees, state), { growth: 2, rankGain: 1, overtaken: ['B'] });
  }
  const updated = comparisonFromRecords(snapshot, [{ ...employees[0], monthReviewsCount: 4 }, employees[1]], [...reviews, { date: '27-10-2026', rating: '5', linkedEmployeeIds: ['a'] }], new Date('2026-10-27T18:00:00Z'));
  assert.equal(updated.baselineDay, '2026-10-27');
  assert.equal(dailyProgress({ ...employees[0], monthReviewsCount: 4 }, employees, updated).growth, 1);
});

test('new month resets prior-month progress and negative review activity advances the day', () => {
  const employees = [{ id: 'a', name: 'A', monthReviewsCount: 1 }];
  const state = { settings: enabled, baselineDay: null, baseline: {} };
  const reviews = [{ date: '26-10-2026', rating: '5', linkedEmployeeIds: ['a'] }, { date: '27-10-2026', rating: '1', linkedEmployeeIds: ['a'] }];
  const today = comparisonFromRecords(state, employees, reviews, new Date('2026-10-27T12:00:00Z'));
  assert.equal(today.baselineDay, '2026-10-27');
  assert.equal(dailyProgress(employees[0], employees, today).growth, 0);
  const nextMonth = comparisonFromRecords(today, [{ ...employees[0], monthReviewsCount: 0 }], reviews, new Date('2026-10-31T21:01:00Z'));
  assert.equal(nextMonth.baselineDay, '2026-11-01');
  assert.deepEqual(nextMonth.baseline, { a: 0 });
});
