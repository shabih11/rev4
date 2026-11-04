import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { createEmployeeActions } = await import(moduleUrl('employeeActions'));
const { createTimelineActions } = await import(moduleUrl('timelineActions'));
const { createReviewActions } = await import(moduleUrl('reviewActions'));
const { enrichEmployees } = await import(moduleUrl('employeeMetrics'));
const employee = { id: 'e', name: 'Test', role: 'employee', branch: 'شرق', email: '', points: 0, reviewsCount: 0,
  stats: { positive: 0, negative: 2, complaints: 0, safety: 0 } };
function employeeHarness(role = 'admin', summaryReady = true, error = null) {
  const calls = [], notices = [];
  let invalidated = 0;
  const actions = createEmployeeActions({ users: [employee], setUsers() {}, summaryReady,
    session: { account: { ...employee, role }, uid: 'test', ready: true, error: null }, branchSettings: { سلام: {} },
    client: { rpc: async (...args) => { calls.push(args); return { error }; } },
    invalidate: async () => { invalidated++; }, notify: text => notices.push(text) });
  return { actions, calls, notices, invalidated: () => invalidated };
}

test('employee administration rejects insufficient roles, incomplete summaries and unknown destinations before writes', async () => {
  for (const [role, ready] of [['manager', true], ['employee', true], ['admin', false]]) {
    const h = employeeHarness(role, ready);
    assert.equal(await h.actions.setEmployeeDisabled('e', true), false);
    assert.equal(await h.actions.transferEmployee('e', 'سلام'), false);
    assert.equal(await h.actions.mergeEmployees('e', 'duplicate'), false);
    assert.equal(h.calls.length, 0);
  }
  const h = employeeHarness();
  assert.equal(await h.actions.transferEmployee('e', 'unknown'), false);
  assert.equal(await h.actions.setEmployeeDisabled('missing', true), false);
  assert.equal(h.calls.length, 0);
});

test('transfer retains the original branch as its concurrency baseline and invalidates only a successful save', async () => {
  const h = employeeHarness();
  assert.equal(await h.actions.transferEmployee('e', 'سلام'), true);
  assert.deepEqual(h.calls, [['transfer_employee', { employee_id: 'e', requested_branch: 'سلام', expected_branch: 'شرق', expected_mobile: false }]]);
  assert.equal(h.invalidated(), 1);
  const failed = employeeHarness('admin', true, { code: 'PT409' });
  assert.equal(await failed.actions.transferEmployee('e', 'سلام'), false);
  assert.equal(failed.invalidated(), 0);
});

test('accepting a request submits its decision and merged shift together without duplicating employees', () => {
  const original = [{ id: 's', type: 'shift', branch: 'شرق', date: '04-11-2026', time: '07:00', employees: [{ id: 'e', name: 'Test' }] },
    { id: 'r', type: 'gap', branch: 'شرق', date: '04-11-2026', time: '07:00', requestedShift: 'first', requestStatus: 'pending', employees: [{ id: 'e', name: 'Test' }, { id: 'b', name: 'Other' }] }];
  const before = structuredClone(original), writes = [];
  const actions = createTimelineActions({ timeline: original, setTimeline: change => writes.push(change(original)), scope: { all: true }, ready: true, notify() {} });
  actions.acceptShiftRequest('r', '07:00', '16:00');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].find(row => row.id === 'r').requestStatus, 'accepted');
  assert.deepEqual(writes[0].find(row => row.id === 's').employees.map(row => row.id), ['e', 'b']);
  assert.deepEqual(original, before);
});

test('timeline creation cannot save an incomplete or absent record scope', () => {
  for (const [scope, ready] of [[null, true], [{ all: true }, false]]) {
    const writes = [], notices = [];
    const actions = createTimelineActions({ timeline: [], scope, ready, setTimeline: rows => writes.push(rows), notify: text => notices.push(text) });
    actions.addTimelineEvent({ type: 'shift', branch: 'شرق', date: '04-11-2026', time: '07:00' });
    assert.equal(writes.length, 0);
    assert.equal(notices.length, 1);
  }
});

test('bulk clearing refuses narrowed or incomplete reads before touching either data collection', () => {
  for (const [scope, ready] of [[{ branches: ['شرق'] }, true], [{ all: true }, false]]) {
    const writes = [], notices = [];
    const actions = createReviewActions({ reviews: [], timeline: [], setReviews: rows => writes.push(rows), setTimeline: rows => writes.push(rows),
      reviewScope: scope, timelineScope: { all: true }, reviewReady: ready, timelineReady: true, deleteTimelineEvent() {}, notify: text => notices.push(text) });
    actions.clearData();
    assert.equal(writes.length, 0);
    assert.equal(notices.length, 1);
  }
});

test('employee metrics preserve shared review credit, monthly cutoff, manual adjustments and source records', () => {
  const user = { ...employee, manualStats: { positive: 1, negative: -4, complaints: 1, safety: 1, monthReviews: 2 } };
  const reviews = [{ id: 'a', date: '04-11-2026', rating: '٥', linkedEmployeeIds: ['e', 'b'] },
    { id: 'b', date: '31-10-2026', rating: '5', linkedEmployeeIds: ['e'] }];
  const notes = [{ type: 'gap', title: 'شكوى', date: '04-11-2026', employees: [{ id: 'e' }] }];
  const source = structuredClone({ user, reviews, notes });
  const [result] = enrichEmployees([user], reviews, notes, new Date('2026-11-04T12:00:00+03:00'), true, 'test-image');
  assert.equal(result.monthReviewsCount, 2.5);
  assert.equal(result.reviewsCount, 2);
  assert.deepEqual(result.stats, { positive: 1.125, negative: 0, complaints: 2, safety: 1 });
  assert.equal(result.points, 2.125);
  assert.deepEqual({ user, reviews, notes }, source);
});
