import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moduleUrl } from './helpers/typescript.mjs';
const { seaMission, seaForegroundBerths, seaBerths, seaOpening, seaJourneyProgress, seaDailyRule, SEA_BRANCHES } = await import(moduleUrl('seaMission'));
const instant = value => Date.parse(value + '+03:00');
test('a branch moves ahead as soon as its daily target is reached', () => {
  const now = instant('2026-11-05T15:00:00');
  const initial = seaMission([], now).branches;
  const before = seaForegroundBerths(initial, now);
  const trailing = before.reduce((last, item) => item.y > last.y ? item : last).name;
  const updated = initial.map(item => item.name === trailing ? { ...item,
    current: { ...item.current, count: item.current.target } } : item);
  const after = seaForegroundBerths(updated, now);
  const leader = after.find(item => item.name === trailing);
  assert.ok(after.filter(item => item.name !== trailing).every(item => leader.y < item.y));
});
let id = 0;
function review(branch, stamp, rating = '5') {
  const local = new Date(stamp + 3 * 3600000).toISOString();
  return { id: String(++id), branch, date: local.slice(0, 10), time: local.slice(11, 19), rating };
}
const branch = (reviews, now, name = 'شرق') => seaMission(reviews, now).branches.find(row => row.name === name);
function completedDays(name, first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => Array.from({ length: seaDailyRule(first + index).target }, (_, offset) => review(name, seaOpening(name, first + index) + offset * 1000))).flat();
}

function countedDay(name, day, count) {
  return Array.from({ length: count }, (_, offset) => review(name, seaOpening(name, day) + offset * 1000));
}
function monthWithCounts(name, overrides = {}) {
  return Array.from({ length: 26 }, (_, index) => {
    const day = index + 5;
    return countedDay(name, day, overrides[day] ?? seaDailyRule(day).target);
  }).flat();
}

test('phase boundaries use targets 2/3/4 and round half of three up to two', () => {
  for (const day of [5, 15]) assert.deepEqual(seaDailyRule(day), { phase: 1, target: 2, minimum: 1 });
  for (const day of [16, 25]) assert.deepEqual(seaDailyRule(day), { phase: 2, target: 3, minimum: 2 });
  for (const day of [26, 30]) assert.deepEqual(seaDailyRule(day), { phase: 3, target: 4, minimum: 2 });
  assert.throws(() => seaDailyRule(4)); assert.throws(() => seaDailyRule(31));
});

test('one half-target day in each phase gives three independent graces and arrival', () => {
  const rows = monthWithCounts('شرق', { 5: 1, 16: 2, 26: 2 });
  const state = branch(rows, seaOpening('شرق', 31));
  assert.equal(state.status, 'arrived');
  assert.deepEqual(state.days.filter(day => day.graceUsed).map(day => day.day), [5, 16, 26]);
});

test('second short day in the same phase sinks even after intervening fully completed days', () => {
  for (const [first, second, count] of [[5, 15, 1], [16, 25, 2], [26, 30, 3]]) {
    const rows = monthWithCounts('شرق', { [first]: count, [second]: count });
    const state = branch(rows, seaOpening('شرق', 31));
    assert.equal(state.status, 'sunk');
    assert.equal(state.failedDay.day, second);
    assert.deepEqual(state.days.filter(day => day.graceUsed).map(day => day.day), [first]);
  }
});

test('below half sinks immediately even with an unused grace in that phase', () => {
  for (const [day, count] of [[5, 0], [16, 1], [26, 1]]) {
    const state = branch(monthWithCounts('شرق', { [day]: count }), seaOpening('شرق', day + 1));
    assert.equal(state.status, 'sunk');
    assert.equal(state.failedDay.day, day);
    assert.equal(state.days.some(day => day.graceUsed), false);
  }
});

test('unused graces cannot be carried forward and used graces cannot resurrect a sunken branch', () => {
  const rows = monthWithCounts('شرق', { 16: 2, 17: 2 });
  const state = branch(rows, seaOpening('شرق', 31));
  assert.equal(state.status, 'sunk'); assert.equal(state.failedDay.day, 17);
  assert.deepEqual(state.days.filter(day => day.graceUsed).map(day => day.day), [16]);
});

test('grace is consumed only when the business day closes, including its last second', () => {
  const end = seaOpening('شرق', 6);
  const rows = countedDay('شرق', 5, 1);
  const before = branch(rows, end - 1);
  assert.equal(before.status, 'sailing'); assert.equal(before.days[0].graceUsed, false);
  const after = branch(rows, end);
  assert.equal(after.status, 'sailing'); assert.equal(after.days[0].graceUsed, true);
  assert.equal(branch(rows, seaOpening('شرق', 7)).status, 'sunk');
});

test('phase is determined by business-day start, not by midnight or review calendar date', () => {
  const rows = [...completedDays('شرق', 5, 14), review('شرق', instant('2026-11-16T06:59:59'))];
  const before = branch(rows, seaOpening('شرق', 16) - 1);
  assert.equal(before.current.day, 15); assert.equal(before.current.target, 2);
  const after = branch(rows, seaOpening('شرق', 16));
  assert.equal(after.status, 'sailing'); assert.equal(after.days[10].graceUsed, true);
  assert.equal(after.current.day, 16); assert.equal(after.current.target, 3);
  const withSecondGrace = branch([...rows, ...countedDay('شرق', 16, 2)], seaOpening('شرق', 17));
  assert.equal(withSecondGrace.status, 'sailing');
  assert.deepEqual(withSecondGrace.days.filter(day => day.graceUsed).map(day => day.day), [15, 16]);
});

test('last day of phase two keeps its three-review target until the opening on November 26', () => {
  const rows = [...completedDays('شرق', 5, 24), ...countedDay('شرق', 25, 2)];
  const before = branch(rows, seaOpening('شرق', 26) - 1);
  assert.equal(before.current.target, 3);
  const after = branch(rows, seaOpening('شرق', 26));
  assert.equal(after.status, 'sailing'); assert.equal(after.current.target, 4);
  assert.equal(after.days.find(day => day.day === 25).graceUsed, true);
});

test('four-review phase includes overnight reviews up to the Friday opening', () => {
  const rows = [...completedDays('شرق', 5, 25), review('شرق', instant('2026-11-26T07:00:00')), review('شرق', instant('2026-11-27T13:59:59'))];
  const state = branch(rows, seaOpening('شرق', 27));
  assert.equal(state.status, 'sailing');
  const day = state.days.find(day => day.day === 26);
  assert.equal(day.count, 2); assert.equal(day.target, 4); assert.equal(day.graceUsed, true);
});

test('uncertain timestamps do not consume a grace or make a later exclusion final', () => {
  const first = countedDay('شرق', 5, 2);
  const rows = [first[0], { ...first[1], time: '' }, ...countedDay('شرق', 6, 1)];
  const now = seaOpening('شرق', 7);
  const unresolved = branch(rows, now);
  assert.equal(unresolved.status, 'unverified'); assert.equal(unresolved.days.some(day => day.graceUsed), false);
  const resolved = branch([first[0], first[1], rows[2]], now);
  assert.equal(resolved.status, 'sailing');
  assert.deepEqual(resolved.days.filter(day => day.graceUsed).map(day => day.day), [6]);
});

test('late reviews can release an earlier grace for another day and do not mutate source rows', () => {
  const rows = [...countedDay('شرق', 5, 1), ...countedDay('شرق', 6, 1)];
  const now = seaOpening('شرق', 7), snapshot = JSON.stringify(rows);
  assert.equal(branch(rows, now).failedDay.day, 6);
  const rescued = branch([...rows, review('شرق', seaOpening('شرق', 5) + 60000)], now);
  assert.equal(rescued.status, 'sailing');
  assert.deepEqual(rescued.days.filter(day => day.graceUsed).map(day => day.day), [6]);
  assert.equal(JSON.stringify(rows), snapshot);
});

test('phase-two grace requires two unique positive reviews, not duplicate rows or low stars', () => {
  const rows = completedDays('شرق', 5, 15), positive = countedDay('شرق', 16, 1)[0];
  const state = branch([...rows, positive, positive, review('شرق', seaOpening('شرق', 16), '3')], seaOpening('شرق', 17));
  assert.equal(state.status, 'sunk'); assert.equal(state.failedDay.count, 1);
});

test('graces are independent per branch and reward shares include rescued survivors', () => {
  const a = monthWithCounts('شرق', { 5: 1, 16: 2, 26: 2 });
  const b = monthWithCounts('سلام', { 5: 1, 16: 2, 26: 3 });
  const state = seaMission([...a, ...b], seaOpening('جاليري', 31));
  assert.equal(state.remaining, 2); assert.equal(state.share, 500);
  for (const name of ['شرق', 'سلام']) assert.equal(state.branches.find(row => row.name === name).days.filter(day => day.graceUsed).length, 3);
});

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
  const grace = branch(rows.slice(0, 1).concat(rows[2]), end);
  assert.equal(grace.status, 'sailing'); assert.equal(grace.days[0].graceUsed, true);
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
  assert.equal(branch(rows.slice(0, 1), now).days[0].graceUsed, true);
  assert.equal(branch(rows, now).status, 'sailing');
  assert.equal(branch(rows, now).days[0].graceUsed, false);
  assert.equal(JSON.stringify(rows), original);
});

test('island starts far away, advances once per business day and is nearest on November 30', () => {
  assert.equal(seaJourneyProgress(instant('2026-11-04T23:59:59')), 0);
  assert.equal(seaJourneyProgress(seaOpening('شرق', 5)), 0);
  assert.equal(seaJourneyProgress(seaOpening('شرق', 6) - 1), 0);
  assert.equal(seaJourneyProgress(seaOpening('شرق', 6)), 1 / 25);
  assert.equal(seaJourneyProgress(seaOpening('شرق', 6) + 3600000), 1 / 25);
  for (let day = 7; day <= 30; day++) {
    assert.equal(seaJourneyProgress(seaOpening('شرق', day)), (day - 5) / 25);
  }
  assert.equal(seaJourneyProgress(instant('2026-12-10T20:00:00')), 1);
});

test('island approach follows competition dates independently of branch elimination', () => {
  const now = seaOpening('جاليري', 20);
  const sunk = seaMission([], now);
  const surviving = seaMission(SEA_BRANCHES.flatMap(name => completedDays(name, 5, 20)), now);
  assert.equal(sunk.remaining, 0);
  assert.equal(sunk.journeyProgress, 15 / 25);
  assert.equal(sunk.journeyProgress, surviving.journeyProgress);
});

const berths = (reviews, now) => seaBerths(seaMission(reviews, now).branches, now);
test('boats start in two rows and move one row at the daily target, once per day', () => {
  const now = instant('2026-11-05T16:00:00');
  assert.deepEqual(berths([], now).map(boat => boat.row), [1, 1, 1, 2, 2, 2]);
  const rows = countedDay('المملكة', 5, 2);
  assert.equal(berths(rows.slice(0, 1), now).find(boat => boat.name === 'المملكة').row, 2);
  assert.equal(berths(rows, now).find(boat => boat.name === 'المملكة').row, 1);
  assert.deepEqual(berths([...rows, ...rows, ...countedDay('المملكة', 5, 4)], now), berths(rows, now));
  assert.equal(berths([...rows, ...countedDay('المملكة', 6, 2)], instant('2026-11-06T16:00:00')).find(boat => boat.name === 'المملكة').row, 0);
});

test('three boats in front clear the middle, and the next rear achievement reaches the middle', () => {
  const now = instant('2026-11-05T16:00:00');
  // Kingdom completed before the leading trio, so it is pushed back with the others.
  const rows = [...countedDay('المملكة', 5, 2), ...SEA_BRANCHES.slice(0, 3).flatMap(name => countedDay(name, 5, 2))];
  const positions = berths(rows, now);
  assert.deepEqual(positions.map(boat => boat.row), [0, 0, 0, 2, 2, 2]);
  const next = berths([...rows, review('شرق', instant('2026-11-05T15:00:00')), review('شرق', instant('2026-11-05T15:01:00'))], now);
  assert.equal(next.find(boat => boat.name === 'شرق').row, 1);
  assert.deepEqual(next.slice(0, 3).map(boat => boat.row), [0, 0, 0]);
});

test('movement follows achievement time rather than synchronization order and corrects late data', () => {
  const now = instant('2026-11-05T16:00:00');
  const rows = SEA_BRANCHES.flatMap(name => countedDay(name, 5, 2));
  assert.deepEqual(berths(rows, now), berths([...rows].reverse(), now));
  const incomplete = rows.filter(row => row.branch !== 'سلام');
  assert.equal(berths(incomplete, now).find(boat => boat.name === 'سلام').row, 2);
  assert.equal(berths(rows, now).find(boat => boat.name === 'سلام').row, 0);
});

test('sunken branches are reset with the fleet and cannot advance from post-sinking targets', () => {
  const now = instant('2026-11-08T16:00:00');
  const leaders = SEA_BRANCHES.slice(0, 3).flatMap(name => [
    ...countedDay(name, 5, 1), ...completedDays(name, 6, 8),
  ]);
  const rows = [...leaders, ...countedDay('المملكة', 8, 2)];
  const state = seaMission(rows, now);
  assert.equal(state.branches.find(boat => boat.name === 'المملكة').status, 'sunk');
  assert.equal(seaBerths(state.branches, now).find(boat => boat.name === 'المملكة').row, 2);
});

test('packed horizontal order stays fixed all Riyadh day and reshuffles tomorrow', () => {
  const now = instant('2026-11-05T16:00:00');
  const horizontal = positions => positions.map(({ name, x }) => ({ name, x }));
  const initial = horizontal(berths([], now));
  const rows = SEA_BRANCHES.flatMap(name => countedDay(name, 5, 2));
  assert.deepEqual(horizontal(berths(rows, now)), initial);
  assert.deepEqual(horizontal(berths(rows, instant('2026-11-05T23:59:59'))), initial);
  assert.notDeepEqual(horizontal(berths(rows, instant('2026-11-06T00:00:00'))), initial);
  assert.equal(new Set(initial.map(boat => boat.x)).size, 3);
  assert.notDeepEqual(initial.map(boat => boat.x), [...initial.map(boat => boat.x)].sort((a, b) => a - b));
});

test('every row holds at most three boats, evenly packed without empty lanes', () => {
  const now = instant('2026-11-06T16:00:00');
  for (let mask = 0; mask < 64; mask++) {
    const reviews = SEA_BRANCHES.flatMap((name, index) => [
      ...countedDay(name, 5, 2), ...(mask & (1 << index) ? countedDay(name, 6, 2) : []),
    ]);
    const positions = berths(reviews, now);
    assert.equal(positions.length, 6);
    for (let row = 0; row < 3; row++) {
      const peers = positions.filter(boat => boat.row === row).sort((a, b) => a.x - b.x);
      assert.ok(peers.length <= 3, `overfull row ${row} for achievement set ${mask}`);
      assert.deepEqual(peers.map(boat => boat.x), peers.map((_, index) => (index + .5) * 100 / peers.length));
      assert.ok(peers.every(boat => boat.width === 30));
    }
    assert.deepEqual(berths([...reviews].reverse(), now), positions);
  }
});

test('front boats continue racing on later daily goals while the view stays within three rows', () => {
  const rows = SEA_BRANCHES.slice(0, 3).flatMap(name => countedDay(name, 5, 2));
  const nextDay = [...rows, ...countedDay('سلام', 6, 2)];
  const positions = berths(nextDay, instant('2026-11-06T16:00:00'));
  assert.equal(positions.find(boat => boat.name === 'سلام').row, 0);
  assert.equal(positions.find(boat => boat.name === 'جاليري').row, 1);
  assert.equal(positions.find(boat => boat.name === 'ذافيو').row, 1);
  assert.ok(positions.every(boat => boat.row >= 0 && boat.row <= 2));
});


test('foreground boats scatter near the viewer with stable daily positions and no regular grid', () => {
  const now = instant('2026-11-05T17:00:00');
  const branches = seaMission([], now).branches;
  const positions = seaForegroundBerths(branches, now);
  assert.equal(positions.length, 6);
  assert.equal(new Set(positions.map(p => p.y)).size, 6);
  assert.ok(positions.every(p => p.x >= 12 && p.x <= 90 && p.y >= 65 && p.y <= 97));
  assert.deepEqual(seaForegroundBerths(branches, now + 60000), positions);
  assert.notDeepEqual(seaForegroundBerths(branches, now + 86400000), positions);
  assert.deepEqual(seaForegroundBerths([], now), []);
});

test('one gold avatar return rescues a failed day without consuming a phase grace', () => {
  const now = instant('2026-11-08T12:00:00');
  const rows = [...completedDays('شرق', 5, 5), ...completedDays('شرق', 7, 7)];
  assert.equal(branch(rows, now).status, 'sunk');
  const returns = [{ branch: 'شرق', day: 6, actor: 'gold', usedAt: '2026-11-07T09:00:00+03:00' }];
  const rescued = seaMission(rows, now, [], returns).branches.find(item => item.name === 'شرق');
  assert.equal(rescued.status, 'sailing');
  assert.equal(rescued.days.find(day => day.day === 6).avatarRescued, true);
  assert.equal(rescued.days.filter(day => day.graceUsed).length, 0);
  assert.equal(seaMission(rows, instant('2026-11-07T08:00:00'), [], returns).branches.find(item => item.name === 'شرق').status, 'sunk');
});
