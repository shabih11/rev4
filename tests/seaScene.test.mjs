import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moduleUrl } from './helpers/typescript.mjs';
const { seaBranchClock, seaBranchScene, seaSceneBerths, seaLight, seaSunGlare, seaWreckVariant, seaViewDistance, seaIslandApproachDay } = await import(moduleUrl('seaScene'));
const { seaMission, SEA_BRANCHES } = await import(moduleUrl('seaMission'));
const at = value => Date.parse(value + '+03:00');
test('sun glare ends at 15:00 Riyadh without changing the existing light schedule', () => {
  for (const [time, glare, light] of [['06:29:59', false, 'night'], ['06:30:00', true, 'sunny'],
    ['14:59:59.999', true, 'sunny'], ['15:00:00', false, 'sunny'], ['16:59:59', false, 'sunny'],
    ['17:00:00', false, 'soft'], ['23:00:00', false, 'dusk']]) {
    const now = at(`2026-11-08T${time}`);
    assert.equal(seaSunGlare(now), glare);
    assert.equal(seaLight(now), light);
  }
});
const branch = (overrides = {}) => ({ name: 'شرق', status: 'sailing', current: { count: 0, target: 2, uncertain: false }, ...overrides });

test('distant scenery stays through the fifteenth and approaches at Riyadh midnight on the sixteenth', () => {
  assert.equal(seaViewDistance(at('2026-11-08T15:00:00')), 'distant');
  assert.equal(seaViewDistance(at('2026-11-15T23:59:59.999')), 'distant');
  assert.equal(seaViewDistance(at('2026-11-16T00:00:00')), 'near');
  assert.equal(seaViewDistance(at('2026-11-30T23:59:59')), 'near');
});

test('sleeping branches trail open branches toward the island, with later openings last', () => {
  for (const time of ['09:00:00', '11:00:00', '13:00:00', '14:00:00', '23:59:59']) {
    const now = at(`2026-11-05T${time}`);
    const branches = seaMission([], now).branches;
    const positions = seaSceneBerths(branches, now);
    for (const a of branches) for (const b of branches) {
      const aSleeps = seaBranchScene(a, now) === 'sleep';
      const bSleeps = seaBranchScene(b, now) === 'sleep';
      if (aSleeps && (!bSleeps || seaBranchClock(a.name, now).nextOpening > seaBranchClock(b.name, now).nextOpening)) {
        assert.ok(positions.find(p => p.name === a.name).y > positions.find(p => p.name === b.name).y);
      }
    }
    assert.deepEqual(seaSceneBerths(branches, now + 1), positions);
  }
});

test('Riyadh daylight changes independently of sleeping and host timezone', () => {
  for (const [time, expected] of [['00:00:00', 'night'], ['06:29:59', 'night'], ['06:30:00', 'sunny'], ['16:59:59', 'sunny'], ['17:00:00', 'soft'], ['22:59:59', 'soft'], ['23:00:00', 'dusk'], ['23:59:59', 'dusk']]) {
    assert.equal(seaLight(at(`2026-11-05T${time}`)), expected);
  }
});

test('the moonlit sleep period spans midnight until 06:30 Riyadh', () => {
  for (const stamp of ['2026-11-05T23:59:59', '2026-11-06T00:00:00', '2026-11-06T06:29:59', '2026-11-06T06:30:00']) {
    assert.equal(seaLight(at(stamp)), stamp.endsWith('23:59:59') ? 'dusk' : stamp.endsWith('06:30:00') ? 'sunny' : 'night');
  }
});

test('each branch sleeps until its own opening, and midnight closes all branches', () => {
  const openings = { 'شرق': '07:00:00', 'المملكة': '10:00:00', 'سلام': '10:00:00', 'ذافيو': '12:00:00', 'جاليري': '14:00:00', 'القصر': '14:00:00' };
  for (const name of SEA_BRANCHES) {
    const opening = at(`2026-11-05T${openings[name]}`);
    assert.equal(seaBranchScene(branch({ name }), opening - 1), 'sleep');
    assert.equal(seaBranchScene(branch({ name }), opening), 'coffee');
    assert.equal(seaBranchClock(name, opening).closesAt, at('2026-11-06T00:00:00'));
    assert.equal(seaBranchScene(branch({ name }), at('2026-11-06T00:00:00')), 'sleep');
  }
});

test('Friday opening is 14:00 for every branch including after a Thursday night', () => {
  for (const name of SEA_BRANCHES) {
    const morning = at('2026-11-06T08:00:00');
    assert.equal(seaBranchClock(name, morning).nextOpening, at('2026-11-06T14:00:00'));
    assert.equal(seaBranchScene(branch({ name }), morning), 'sleep');
    assert.equal(seaBranchScene(branch({ name }), at('2026-11-06T14:00:00')), 'coffee');
  }
});

test('all staff sleep before campaign launch, even during normal open hours', () => {
  for (const time of ['07:30:00', '14:30:00', '20:00:00', '23:59:59']) {
    const now = at(`2026-11-04T${time}`);
    for (const item of seaMission([], now).branches) assert.equal(seaBranchScene(item, now), 'sleep');
  }
  const now = at('2026-11-05T07:00:00');
  for (const item of seaMission([], now).branches) assert.equal(seaBranchScene(item, now), item.name === 'شرق' ? 'coffee' : 'sleep');
});

test('staff remain asleep in daylight before an afternoon opening', () => {
  const now = at('2026-11-05T09:00:00');
  assert.equal(seaLight(now), 'sunny');
  assert.equal(seaBranchScene(branch({ name: 'جاليري' }), now), 'sleep');
});

test('coffee lasts the first hour, then an incomplete target shows adventure', () => {
  assert.equal(seaBranchScene(branch(), at('2026-11-05T07:59:59')), 'coffee');
  assert.equal(seaBranchScene(branch(), at('2026-11-05T08:00:00')), 'adventure');
  assert.equal(seaBranchScene(branch(), at('2026-11-05T22:59:59')), 'adventure');
});

test('each branch has coffee for one hour at both shift starts, including Friday', () => {
  for (const date of ['2026-11-05', '2026-11-06']) {
    for (const name of SEA_BRANCHES) {
      const item = branch({ name });
      const opening = seaBranchClock(name, at(`${date}T12:00:00`)).opensAt;
      assert.equal(seaBranchScene(item, opening), 'coffee');
      assert.equal(seaBranchScene(item, opening + 3600000 - 1), 'coffee');
      assert.equal(seaBranchScene(item, opening + 3600000), 'adventure');
      assert.equal(seaBranchScene(item, at(`${date}T15:59:59`)), 'adventure');
      assert.equal(seaBranchScene(item, at(`${date}T16:00:00`)), 'coffee');
      assert.equal(seaBranchScene(item, at(`${date}T16:59:59`)), 'coffee');
      assert.equal(seaBranchScene(item, at(`${date}T17:00:00`)), 'adventure');
    }
  }
});

test('daily celebration takes priority over second-shift coffee but preserves final branch states', () => {
  const complete = branch({ current: { count: 2, target: 2, uncertain: false } });
  assert.equal(seaBranchScene(complete, at('2026-11-05T16:00:00')), 'celebrate');
  assert.equal(seaBranchScene(complete, at('2026-11-05T17:00:00')), 'celebrate');
  for (const [status, expected] of [['waiting', 'sleep'], ['sunk', 'capsized'], ['arrived', 'celebrate']]) {
    assert.equal(seaBranchScene(branch({ status }), at('2026-11-05T16:30:00')), expected);
  }
});

test('a completed target celebrates immediately during morning coffee and throughout the open day', () => {
  const complete = branch({ current: { count: 2, target: 2, uncertain: false } });
  assert.equal(seaBranchScene(complete, at('2026-11-05T07:30:00')), 'celebrate');
  assert.equal(seaBranchScene(complete, at('2026-11-05T15:29:59')), 'celebrate');
  assert.equal(seaBranchScene(complete, at('2026-11-05T15:30:00')), 'celebrate');
  assert.equal(seaBranchScene(complete, at('2026-11-05T23:59:59')), 'celebrate');
  assert.equal(seaBranchScene(complete, at('2026-11-06T00:00:00')), 'sleep');
});

test('late hardship is visual only and does not prematurely sink a branch or remove its grace', () => {
  const now = at('2026-11-05T23:00:00');
  const item = seaMission([], now).branches.find(item => item.name === 'شرق');
  assert.equal(seaBranchScene(item, now), 'distress');
  assert.equal(item.status, 'sailing');
  assert.equal(item.failedDay, undefined);
  assert.equal(item.current.graceUsed, false);
});

test('uncertain data never causes a false late failure scene', () => {
  const now = at('2026-11-05T23:30:00');
  assert.equal(seaBranchScene(branch({ status: 'unverified' }), now), 'adventure');
  assert.equal(seaBranchScene(branch({ current: { count: 0, target: 2, uncertain: true } }), now), 'adventure');
});

test('eliminated branches stay capsized even when closed; arrived branches celebrate', () => {
  assert.equal(seaBranchScene(branch({ status: 'sunk' }), at('2026-11-05T08:00:00')), 'capsized');
  assert.equal(seaBranchScene(branch({ status: 'sunk' }), at('2026-11-06T00:00:00')), 'capsized');
  assert.equal(seaBranchScene(branch({ status: 'arrived' }), at('2026-12-01T08:00:00')), 'celebrate');
  assert.equal(seaBranchScene(branch({ status: 'arrived' }), at('2026-12-02T00:00:00')), 'sleep');
});

test('next opening crosses month and year boundaries without tying the visual clock to the campaign month', () => {
  assert.equal(seaBranchClock('شرق', at('2026-11-30T23:30:00')).nextOpening, at('2026-12-01T07:00:00'));
  assert.equal(seaBranchClock('شرق', at('2026-12-31T23:30:00')).nextOpening, at('2027-01-01T14:00:00'));
});


test('distress persists until elimination, followed by the rescue and empty wreck days', () => {
  for (const name of SEA_BRANCHES) {
    const nextOpening = seaBranchClock(name, at('2026-11-06T08:00:00')).nextOpening;
    for (const now of [at('2026-11-05T23:59:59'), at('2026-11-06T00:00:00'), at('2026-11-06T06:30:00'), nextOpening - 1]) {
      const before = seaMission([], now).branches.find(item => item.name === name);
      assert.equal(before.status, 'sailing');
      assert.equal(seaBranchScene(before, now), 'distress');
    }
    for (const now of [nextOpening, at('2026-11-07T00:00:00'), at('2026-11-08T03:00:00')]) {
      const item = seaMission([], now).branches.find(item => item.name === name);
      assert.equal(item.failedDay.day, 5);
      assert.equal(seaBranchScene(item, now), now < at('2026-11-07T00:00:00') ? 'capsized' : now < at('2026-11-08T00:00:00') ? 'rescue' : 'wreck');
    }
  }
});

test('overnight distress does not replace sleep for completed, halfway, or uncertain results', () => {
  const now = at('2026-11-06T01:00:00');
  for (const name of SEA_BRANCHES) {
    const review = { id: 'review', branch: name, rating: '5', date: '2026-11-05', time: '15:00:00' };
    for (const reviews of [[review], [review, { ...review, id: 'second' }], [{ ...review, time: '' }]]) {
      const item = seaMission(reviews, now).branches.find(item => item.name === name);
      assert.equal(seaBranchScene(item, now), 'sleep');
      assert.equal(seaBranchScene({ ...item, status: 'unverified' }, now), 'sleep');
    }
  }
});

test('a grace day and unverified results do not display the eliminated boat', () => {
  const now = at('2026-11-06T14:00:00');
  for (const time of ['08:00:00', '']) {
    const item = seaMission([{ id: 'review', branch: 'شرق', rating: '5', date: '2026-11-05', time }], now)
      .branches.find(item => item.name === 'شرق');
    assert.notEqual(item.status, 'sunk');
    assert.notEqual(seaBranchScene(item, now), 'capsized');
  }
});


test('halfway progress rounds odd targets up and does not use the full-target scene', () => {
  const now = at('2026-11-05T20:00:00');
  for (const target of [2, 3, 4]) {
    const threshold = Math.ceil(target / 2);
    assert.equal(seaBranchScene(branch({ current: { count: threshold - 1, target } }), now), 'adventure');
    assert.equal(seaBranchScene(branch({ current: { count: threshold, target } }), now), 'halfway');
    assert.equal(seaBranchScene(branch({ current: { count: target, target } }), now), 'celebrate');
  }
});

test('halfway appears immediately during coffee and remains until the end of the open day', () => {
  const item = branch({ current: { count: 1, target: 2, uncertain: false } });
  for (const time of ['07:15:00', '16:15:00', '23:59:59']) {
    assert.equal(seaBranchScene(item, at(`2026-11-05T${time}`)), 'halfway');
  }
  assert.equal(seaBranchScene(item, at('2026-11-06T00:00:00')), 'sleep');
  assert.equal(seaBranchScene(branch({ ...item, status: 'sunk' }), at('2026-11-06T01:00:00')), 'capsized');
});

test('halfway counts distinct positive reviews in the current business day and resets next opening', () => {
  const review = { id: 'halfway', branch: 'شرق', rating: '5', date: '2026-11-05', time: '07:10:00' };
  const early = at('2026-11-05T07:15:00');
  const item = seaMission([review, review, { ...review, id: 'negative', rating: '1' }], early).branches.find(item => item.name === 'شرق');
  assert.equal(item.current.count, 1);
  assert.equal(seaBranchScene(item, early), 'halfway');
  const next = at('2026-11-06T14:00:00');
  const fresh = seaMission([review], next).branches.find(item => item.name === 'شرق');
  assert.equal(fresh.current.count, 0);
  assert.equal(fresh.status, 'sailing');
  assert.equal(seaBranchScene(fresh, next), 'coffee');
});


test('all six branches retain day-one art, rescue on day two and cycle four empty wrecks from day three', () => {
  for (const name of SEA_BRANCHES) {
    const item = seaMission([], at('2026-11-06T14:00:00')).branches.find(item => item.name === name);
    for (const [stamp, expected] of [
      ['2026-11-06T23:59:59', 'capsized'],
      ['2026-11-07T00:00:00', 'rescue'], ['2026-11-07T23:59:59', 'rescue'],
      ['2026-11-08T00:00:00', 'wreck'], ['2026-11-12T00:00:00', 'wreck'],
    ]) assert.equal(seaBranchScene(item, at(stamp)), expected, `${name} ${stamp}`);
    for (let offset = 0; offset < 8; offset++) {
      const now = at(`2026-11-${String(8 + offset).padStart(2, '0')}T00:00:00`);
      assert.equal(seaWreckVariant(item, now), offset % 4);
      assert.equal(seaWreckVariant(item, now + 86399999), offset % 4);
    }
    const rollover = { ...item, failedDay: { ...item.failedDay, end: at('2026-11-30T14:00:00') } };
    assert.equal(seaBranchScene(rollover, at('2026-12-01T00:00:00')), 'rescue');
    assert.equal(seaBranchScene(rollover, at('2026-12-02T00:00:00')), 'wreck');
    assert.equal(seaWreckVariant(rollover, at('2026-12-02T00:00:00')), 0);
  }
});

test('rescue slots are separate foreground anchors for one through six simultaneous rescues', () => {
  const now = at('2026-11-07T12:00:00');
  const eliminated = seaMission([], now).branches;
  for (let count = 1; count <= 6; count++) {
    const branches = eliminated.map((item, index) => index < count ? item : { ...item, status: 'sailing', failedDay: undefined });
    const positions = seaSceneBerths(branches, now);
    assert.deepEqual(positions, seaSceneBerths(branches, now + 1));
    const rescues = positions.slice(0, count);
    const others = positions.slice(count);
    for (const rescue of rescues) {
      assert.ok(others.every(other => count === 1 ? other.y > rescue.y : other.y < rescue.y));
      assert.equal(rescue.width, count === 1 ? 50 : 44);
      if (count === 1) {
        assert.equal(rescue.x, 68);
        assert.equal(rescue.y, 48);
      }
      assert.ok(rescue.x - rescue.width / 2 >= 0 && rescue.x + rescue.width / 2 <= 100);
    }
    assert.equal(new Set(rescues.map(p => `${p.x}:${p.y}`)).size, count);
  }
});

test('island approach images change at Riyadh midnight only on phase-two days 1–10', () => {
  assert.equal(seaIslandApproachDay(at('2026-11-15T23:59:59.999')), null);
  for (let i = 0; i < 10; i++) {
    assert.equal(seaIslandApproachDay(at(`2026-11-${16+i}T00:00:00`)), i+1);
    assert.equal(seaIslandApproachDay(at(`2026-11-${16+i}T23:59:59.999`)), i+1);
  }
  assert.equal(seaIslandApproachDay(at('2026-11-26T00:00:00')), null);
  assert.equal(seaIslandApproachDay(at('2026-12-16T12:00:00')), null);
});
