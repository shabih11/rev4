import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { employeeMissions, employeeLevel, levelCost } = await import(moduleUrl('employeeMissions'));
const now = new Date('2026-11-08T15:00:00+03:00');
const review = (id, date = '08-11-2026', ids = ['a'], rating = '5') => ({ id, date, linkedEmployeeIds: ids, rating, branch: 'جاليري', time: '14:00' });
const task = (state, id) => state.missions.find(mission => mission.id === id);
const positives = (count, ids = ['a']) => Array.from({ length: count }, (_, index) => review(`p-${index}`, '08-11-2026', ids));

test('level thresholds double up to reaching 10, then rise 30 percent rounded up without losing excess', () => {
  assert.deepEqual(Array.from({ length: 11 }, (_, index) => levelCost(index + 1)), [5, 10, 20, 40, 80, 160, 320, 640, 1280, 1664, 2164]);
  let total = 0;
  for (let level = 1; level <= 15; level++) {
    assert.equal(employeeLevel(total).level, level);
    assert.equal(employeeLevel(total + levelCost(level) - 0.25).level, level);
    total += levelCost(level);
    assert.equal(employeeLevel(total).level, level + 1);
    assert.equal(employeeLevel(total).current, 0);
  }
  assert.equal(employeeLevel(2555).level, 10);
  assert.equal(employeeLevel(2557.5).current, 2.5);
  assert.equal(employeeLevel(14.999999999999998).level, 3);
  assert.equal(employeeLevel(-4).level, 1);
  assert.equal(employeeLevel(Infinity).level, 1);
  assert.throws(() => levelCost(0), RangeError);
});

test('rating stars come only from distinct valid positive linked reviews and split between unique employees', () => {
  const rows = [review('1'), review('1'), review('shared', '٠٨-١١-٢٠٢٦', ['a', 'a', 'b'], '٤'), review('other', '08-11-2026', ['b']), review('negative', '08-11-2026', ['a'], '1'), review('neutral', '08-11-2026', ['a'], '3'), review('invalid', '31-11-2026'), review('future', '09-11-2026'), review('rating', '08-11-2026', ['a'], '4.5')];
  const state = employeeMissions('a', rows, now);
  assert.equal(state.ratingStars, 7);
  assert.equal(state.bonusStars, 1);
  assert.equal(state.level.level, 2);
  assert.equal(state.level.current, 3);
  assert.equal(task(state, 'daily-two').current, 2);
  assert.equal(task(state, 'partner').current, 1);
  assert.equal(employeeMissions('nobody', rows, now).stars, 0);
  assert.equal(employeeMissions('a', [review('single')], now).level.level, 2);
});

test('two partnership reviews must name the same partner; rewards are independent of input order', () => {
  const rows = [review('1', '07-11-2026', ['a', 'b']), review('2', '08-11-2026', ['a', 'c'])];
  assert.equal(task(employeeMissions('a', rows, now), 'partner').current, 1);
  rows.push(review('3', '08-11-2026', ['a', 'b']));
  const state = employeeMissions('a', rows, now);
  assert.equal(task(state, 'partner').current, 2);
  assert.equal(state.bonusStars, 4);
  assert.deepEqual(employeeMissions('a', [...rows].reverse(), now), state);
});

test('Riyadh midnight resets daily missions while earned stars and monthly progress remain', () => {
  const rows = positives(2);
  const before = employeeMissions('a', rows, new Date('2026-11-08T20:59:59Z'));
  const after = employeeMissions('a', rows, new Date('2026-11-08T21:00:00Z'));
  assert.equal(task(before, 'daily-two').current, 2);
  assert.equal(task(after, 'daily-two').current, 0);
  assert.equal(after.stars, before.stars);
  assert.equal(after.bonusStars, 1);
});

test('daily and monthly rewards accrue once in each distinct period, never on refresh; level survives month change', () => {
  const rows = [...positives(10), ...Array.from({ length: 10 }, (_, i) => review(`oct-${i}`, '08-10-2026'))];
  const state = employeeMissions('a', rows, now);
  assert.equal(state.ratingStars, 100);
  assert.equal(state.bonusStars, 22);
  assert.deepEqual(employeeMissions('a', rows.concat(rows), now), state);
  assert.deepEqual(employeeMissions('a', rows, now), state);
  const december = employeeMissions('a', rows, new Date('2026-12-01T00:00:00+03:00'));
  assert.equal(december.stars, state.stars);
  assert.equal(december.level.level, state.level.level);
  assert.equal(task(december, 'ten').current, 0);
});

test('consistency counts distinct days without requiring consecutive days; team diversity counts distinct partners', () => {
  const rows = [1, 2, 4, 6, 8].map((day, i) => review(`d-${day}`, `${day}-11-2026`, ['a', `partner-${i % 3}`]));
  const state = employeeMissions('a', rows, now);
  assert.equal(task(state, 'days').current, 5);
  assert.equal(task(state, 'partners').current, 3);
  assert.equal(state.bonusStars, 8 + 6 + 3);
});

test('recovery appears only with an imported negative and follows four surplus positive shares after the first 20', () => {
  assert.equal(task(employeeMissions('a', positives(24), now), 'recovery'), undefined);
  const negative = review('negative', '01-11-2026', ['a'], '2');
  const before = employeeMissions('a', [...positives(23), negative], now);
  const after = employeeMissions('a', [...positives(24), negative], now);
  assert.equal(task(before, 'recovery').current, 3);
  assert.equal(task(after, 'recovery').current, 4);
  assert.equal(after.bonusStars - before.bonusStars, 8);
  assert.equal(employeeMissions('a', [negative], now).ratingStars, 0);
});

test('recovery respects fractional shares of both negative and positive shared reviews', () => {
  const negative = review('negative', '01-11-2026', ['a', 'b'], '1');
  const before = employeeMissions('a', [...positives(43, ['a', 'b']), negative], now);
  const after = employeeMissions('a', [...positives(44, ['a', 'b']), negative], now);
  assert.equal(task(before, 'recovery').target, 2);
  assert.equal(task(before, 'recovery').current, 1.5);
  assert.equal(task(after, 'recovery').current, 2);
  assert.equal(after.bonusStars - before.bonusStars, 8);
});

test('correcting or deleting imported ratings removes their stars and unearned bonuses', () => {
  const rows = positives(10);
  const before = employeeMissions('a', rows, now);
  const after = employeeMissions('a', rows.slice(1), now);
  assert.equal(before.stars - after.stars, 15);
  assert.equal(employeeMissions('a', [], now).stars, 0);
});
