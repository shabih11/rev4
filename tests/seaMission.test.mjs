import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const cache = new Map();
function moduleUrl(name) {
  if (cache.has(name)) return cache.get(name);
  let code = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  code = code.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${moduleUrl(path.slice(2))}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  cache.set(name, url); return url;
}
const { seaMission, seaOpening, SEA_BRANCHES } = await import(moduleUrl('seaMission'));
const instant = value => Date.parse(value + '+03:00');
let id = 0;
function review(branch, stamp, rating = '5') {
  const local = new Date(stamp + 3 * 3600000).toISOString();
  return { id: String(++id), branch, date: local.slice(0, 10), time: local.slice(11, 19), rating };
}
const branch = (reviews, now, name = 'شرق') => seaMission(reviews, now).branches.find(row => row.name === name);
function completedDays(name, first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => [review(name, seaOpening(name, first + index)), review(name, seaOpening(name, first + index) + 1000)]).flat();
}

test('uses existing branch openings in Riyadh and the Friday override', () => {
  for (const [name, hour] of [['جاليري', 14], ['القصر', 14], ['المملكة', 10], ['سلام', 10], ['شرق', 7], ['ذافيو', 12]]) {
    assert.equal(seaOpening(name, 5), instant(`2026-11-05T${String(hour).padStart(2, '0')}:00:00`));
    assert.equal(seaOpening(name, 6), instant('2026-11-06T14:00:00'));
    assert.equal(seaOpening(name, 7), instant(`2026-11-07T${String(hour).padStart(2, '0')}:00:00`));
  }
  assert.equal(seaOpening('شرق', 6) - seaOpening('شرق', 5), 31 * 3600000);
  assert.equal(seaOpening('شرق', 7) - seaOpening('شرق', 6), 17 * 3600000);
});
test('all branches wait before November 5 and no reward share is promised', () => {
  const state = seaMission([], instant('2026-11-03T20:00:00'));
  assert.ok(state.branches.every(row => row.status === 'waiting'));
  assert.equal(state.remaining, 6); assert.equal(state.share, null);
});
test('incomplete business day survives until next opening, including the last second', () => {
  const end = seaOpening('شرق', 6);
  assert.equal(branch([], end - 1000).status, 'sailing');
  assert.equal(branch([], end - 1).status, 'sailing');
  const row = branch([], end);
  assert.equal(row.status, 'sunk'); assert.equal(row.failedDay.day, 5);
});
test('last second belongs to old day; a review at next opening belongs to new day', () => {
  const start = seaOpening('شرق', 5), end = seaOpening('شرق', 6);
  const rows = [review('شرق', start), review('شرق', end - 1000), review('شرق', end)];
  const state = branch(rows, end);
  assert.equal(state.status, 'sailing');
  assert.equal(state.days[0].count, 2); assert.equal(state.current.count, 1);
  assert.equal(branch(rows.slice(0, 1).concat(rows[2]), end).status, 'sunk');
});
test('counts unique branch reviews with 4/5 stars, independent of linked employee count', () => {
  const stamp = seaOpening('جاليري', 5);
  const four = { ...review('الرياض جاليري', stamp, '٤'), linkedEmployeeIds: ['a', 'b'] };
  const five = { ...review('جاليري', stamp + 1000, '٥'), date: '٠٥-١١-٢٠٢٦', time: '٢:٠٠:٠١ م' };
  const rows = [four, four, five, review('جاليري', stamp, '3'), review('جاليري', stamp, '1'), review('جاليري', stamp, '4.5'), review('سلام', stamp)];
  assert.equal(branch(rows, seaOpening('جاليري', 6), 'جاليري').days[0].count, 2);
});
test('extra reviews and later days cannot compensate for the first failed day', () => {
  const rows = [...completedDays('شرق', 5, 5), ...completedDays('شرق', 7, 8)];
  rows.push(...Array.from({ length: 8 }, () => review('شرق', seaOpening('شرق', 8))));
  const state = branch(rows, seaOpening('شرق', 9));
  assert.equal(state.status, 'sunk'); assert.equal(state.failedDay.day, 6);
});
test('rejects pre-opening, out-of-campaign, invalid and future timestamps', () => {
  const start = seaOpening('شرق', 5);
  const rows = [review('شرق', start - 1000), review('شرق', start + 60000), { ...review('شرق', start), date: '31-02-2026' }];
  assert.equal(branch(rows, start).current.count, 0);
  assert.equal(branch(rows, start + 60000).current.count, 1);
});
test('missing times block a premature exclusion and leave shares unconfirmed', () => {
  const stamp = seaOpening('شرق', 5);
  const rows = [review('شرق', stamp), { ...review('شرق', stamp), time: '' }];
  const state = seaMission(rows, seaOpening('شرق', 6));
  assert.equal(state.branches.find(row => row.name === 'شرق').status, 'unverified');
  assert.equal(state.share, null);
});
test('Nov 30 business day finishes at Dec 1 opening; shares split only between survivors', () => {
  const rows = [...completedDays('جاليري', 5, 30), ...completedDays('شرق', 5, 30)];
  const before = seaMission(rows, seaOpening('شرق', 31) - 1);
  assert.equal(before.finished, false);
  assert.equal(before.branches.find(row => row.name === 'شرق').status, 'sailing');
  const after = seaMission(rows, seaOpening('جاليري', 31));
  assert.equal(after.finished, true); assert.equal(after.remaining, 2); assert.equal(after.share, 500);
  assert.equal(after.branches.filter(row => row.status === 'arrived').length, 2);
});
test('supports all six surviving and zero survivors without dividing by zero', () => {
  const full = SEA_BRANCHES.flatMap(name => completedDays(name, 5, 30));
  const now = seaOpening('جاليري', 31);
  assert.equal(seaMission(full, now).remaining, 6);
  assert.equal(seaMission(full, now).share, 1000 / 6);
  assert.equal(seaMission([], now).remaining, 0);
  assert.equal(seaMission([], now).share, null);
});
test('late synchronization recomputes from review occurrence time without altering input', () => {
  const now = seaOpening('شرق', 6);
  const rows = completedDays('شرق', 5, 5);
  const original = JSON.stringify(rows);
  assert.equal(branch(rows.slice(0, 1), now).status, 'sunk');
  assert.equal(branch(rows, now).status, 'sailing');
  assert.equal(JSON.stringify(rows), original);
});
