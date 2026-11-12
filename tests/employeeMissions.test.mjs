import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { employeeMissions, employeeLevel, levelCost, gradeReward, employeeAchievementEvidence } = await import(moduleUrl('employeeMissions'));
const now = new Date('2026-11-08T15:00:00+03:00');
const review = (id, date = '08-11-2026', ids = ['a'], rating = '5') => ({ id, date, linkedEmployeeIds: ids, rating });
const positives = (count, date = '08-11-2026', ids = ['a']) => Array.from({ length: count }, (_, i) => review(`${date}-${i}`, date, ids));
const task = (state, id) => state.missions.find(m => m.id === id);

test('50-star first transition, 25 percent growth rounded to nearest five, preserving surplus', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => levelCost(i + 1)), [50,65,80,100,120,155]);
  let total = 0;
  for (let level = 1; level <= 20; level++) {
    assert.equal(employeeLevel(total).level, level);
    assert.equal(employeeLevel(total + levelCost(level) - 0.25).level, level);
    total += levelCost(level);
    assert.equal(employeeLevel(total).current, 0);
  }
  assert.equal(employeeLevel(52).current, 2);
  assert.equal(employeeLevel(-1).level, 1);
  assert.equal(employeeLevel(Infinity).level, 1);
  assert.throws(() => levelCost(0), RangeError);
});

test('historical coins include all periods but stars and badges start in November 2026', () => {
  const rows = [...positives(10, '08-10-2026'), ...positives(10)];
  const state = employeeMissions('a', rows, now);
  assert.equal(state.ratingCoins, 100);
  assert.equal(state.bonusCoins, 96.56);
  assert.equal(state.coins, 196.56);
  assert.equal(state.ratingStars, 50);
  assert.equal(state.bonusStars, 71.56);
  assert.equal(state.stars, 121.56);
  assert.ok(state.achievements.every(a => a.month === '2026-11'));
  const december = employeeMissions('a', rows, new Date('2026-12-01T00:00:00+03:00'));
  assert.equal(december.stars, state.stars);
  assert.equal(december.coins, state.coins);
  assert.equal(task(december, 'ten').current, 0);
  assert.deepEqual(employeeMissions('a', rows.concat(rows).reverse(), now), state);
});

test('only valid distinct 4/5 ratings earn five coins and stars, shared rewards remain whole', () => {
  const rows = [review('1'),review('1'),review('shared','٠٨-١١-٢٠٢٦',['a','a','b'],'٤'),review('other','08-11-2026',['b']),review('negative','08-11-2026',['a'],'1'),review('neutral','08-11-2026',['a'],'3'),review('invalid','31-11-2026'),review('future','09-11-2026'),review('bad','08-11-2026',['a'],'4.5')];
  const state = employeeMissions('a', rows, now);
  assert.equal(state.ratingStars, 10);
  assert.equal(state.ratingCoins, 10);
  assert.equal(state.bonusStars, 5);
  assert.equal(state.bonusCoins, 5);
  assert.equal(task(state,'partner').current, 1);
  assert.equal(employeeMissions('nobody',rows,now).stars, 0);
});

test('Riyadh midnight resets daily goal, never its historical rewards', () => {
  const rows = positives(2);
  const before = employeeMissions('a', rows, new Date('2026-11-08T20:59:59Z'));
  const after = employeeMissions('a', rows, new Date('2026-11-08T21:00:00Z'));
  assert.equal(task(before,'daily-two').current, 2);
  assert.equal(task(after,'daily-two').current, 0);
  assert.equal(after.coins,before.coins);
  assert.equal(after.stars,before.stars);
});

test('each mission advances independently and resets to green each month', () => {
  for (const [count, target, band, completed] of [[0,2,0,0],[1,2,0,0],[2,3,1,1],[3,5,2,2],[4,5,2,2],[5,5,2,3]]) {
    const state = employeeMissions('a', positives(count), now);
    const daily = task(state, 'daily-two');
    assert.equal(daily.target, target);
    assert.equal(daily.band, band);
    assert.equal(daily.completedBands, completed);
    assert.equal(daily.stars, gradeReward(5, band));
    assert.equal(task(state, 'ten').band, 0);
  }
  const rows = positives(40);
  const december = employeeMissions('a', rows, new Date('2026-12-01T00:00:00+03:00'));
  assert.equal(task(december, 'ten').target, 10);
  assert.equal(task(december, 'daily-two').target, 2);
  assert.equal(december.coins, employeeMissions('a', rows, now).coins);
});

test('all grades reward once, including thresholds crossed in a single import', () => {
  assert.deepEqual([0,1,2].map(band => gradeReward(5, band)), [5,11.25,25.31]);
  const state = employeeMissions('a', positives(5), now);
  assert.equal(state.bonusStars, 41.56);
  assert.equal(state.bonusCoins, 41.56);
  assert.equal(state.achievements.length, 3);
  assert.deepEqual(employeeMissions('a', positives(5).reverse(), now), state);
  for (const badge of state.achievements) {
    assert.ok(employeeAchievementEvidence('a', positives(5), badge, state.today));
  }
  const corrected = employeeMissions('a', positives(4), now);
  assert.equal(Math.round((state.coins - corrected.coins) * 100) / 100, 30.31);
});

test('distinct days and partners award separate effort bonuses', () => {
  const rows = [1,2,4,6,8].map((d,i) => review(`d${d}`,`${d}-11-2026`,['a',`b${i%3}`]));
  const state = employeeMissions('a',rows,now);
  assert.equal(task(state,'days').current,5);
  assert.equal(task(state,'partners').current,3);
  assert.equal(state.bonusCoins,20+15+10);
  assert.equal(state.bonusStars,25+20+15);
});

test('recovery uses fractional surplus shares after 20 and compensates only first negative', () => {
  for (const [members,count,target] of [[['a'],24,4],[['a','b'],44,2]]) {
    const negative = review('negative','01-11-2026',members,'1');
    const before = employeeMissions('a',[...positives(count-1,'08-11-2026',members),negative],now);
    const after = employeeMissions('a',[...positives(count,'08-11-2026',members),negative],now);
    assert.equal(task(after,'recovery').target,target * 1.5);
    assert.equal(task(after,'recovery').current,target);
    assert.equal(after.bonusStars-before.bonusStars,25);
    assert.equal(after.bonusCoins-before.bonusCoins,20);
  }
  assert.equal(task(employeeMissions('a',positives(24),now),'recovery'),undefined);
});

test('corrected or deleted ratings remove derived earnings without repeat claims', () => {
  const before = employeeMissions('a',positives(10),now);
  const after = employeeMissions('a',positives(9),now);
  assert.equal(before.stars-after.stars,35);
  assert.equal(before.coins-after.coins,30);
  assert.equal(employeeMissions('a',[],now).stars,0);
});

test('monthly missions advance through all three independent targets', () => {
  const end = new Date('2026-11-30T12:00:00+03:00');
  for (const [id, thresholds, makeRows] of [
    ['ten', [10,20,35], count => positives(count)],
    ['partner', [10,20,30], count => positives(count, '08-11-2026', ['a','b'])],
    ['days', [5,8,12], count => Array.from({length:count}, (_,i) => review(`day-${i}`, `${i+1}-11-2026`))],
    ['partners', [3,4,5], count => Array.from({length:count}, (_,i) => review(`partner-${i}`, '08-11-2026', ['a',`b${i}`]))],
  ]) {
    for (let grade = 0; grade < 3; grade++) {
      const before = task(employeeMissions('a', makeRows(thresholds[grade]-1), end), id);
      const after = task(employeeMissions('a', makeRows(thresholds[grade]), end), id);
      assert.equal(before.target, thresholds[grade]);
      assert.equal(before.band, grade);
      assert.equal(after.completedBands, grade+1);
      assert.equal(after.band, Math.min(2,grade+1));
    }
  }
});

test('daily first grade becomes 13 stars and 15 coins from November 12; other grades stay unchanged', () => {
  const before = employeeMissions('a', positives(2, '11-11-2026'), new Date('2026-11-11T12:00:00+03:00'));
  const after = employeeMissions('a', positives(2, '12-11-2026'), new Date('2026-11-12T12:00:00+03:00'));
  assert.equal(after.bonusStars-before.bonusStars, 8);
  assert.equal(after.bonusCoins-before.bonusCoins, 10);
  const empty = employeeMissions('a', [], new Date('2026-11-12T12:00:00+03:00'));
  assert.equal(task(empty, 'daily-two').stars, 13);
  assert.equal(task(empty, 'daily-two').coins, 15);
  assert.equal(task(after, 'daily-two').stars, gradeReward(5, 1));
});

test('partner mission begins at ten with 88 coins and 98 stars and keeps the 125 percent grade increase', () => {
  const updated = new Date('2026-11-12T12:00:00+03:00');
  for (const [count, target, band] of [[0,10,0],[9,10,0],[10,20,1],[20,30,2],[30,30,2]]) {
    const mission = task(employeeMissions('a', positives(count, '12-11-2026', ['a','b']), updated), 'partner');
    assert.equal(mission.target, target);
    assert.equal(mission.coins, gradeReward(88, band));
    assert.equal(mission.stars, gradeReward(98, band));
  }
});
