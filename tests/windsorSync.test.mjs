import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncReviews, findShift, encode, decode, hash, fetchSnapshot } from '../automation/windsor-sync.mjs';
const row = { account_id: 'locations/16510748030849104251', review_id: 'synthetic-review', review_reviewer: 'عميل تجريبي', review_star_rating: 'FIVE', review_comment: 'جيد', review_create_time: '2026-10-15T08:00:00Z' };
const app = 'projects/iamspec/databases/(default)/documents/apps/rev4';
function database() {
  const docs = new Map(), calls = [];
  const seed = (name, data) => docs.set(name, { name, fields: encode(data).mapValue.fields, updateTime: '1' });
  const data = name => Object.fromEntries(Object.entries(docs.get(name).fields).map(([k, v]) => [k, decode(v)]));
  const post = async (url, body) => {
    calls.push({ url, body });
    if (url.endsWith(':batchGet')) return body.documents.map(name => docs.has(name) ? { found: structuredClone(docs.get(name)) } : { missing: name });
    if (url.endsWith(':runQuery')) return [];
    if (url.endsWith(':commit')) {
      for (const w of body.writes) {
        const old = docs.get(w.update.name);
        assert.equal(Boolean(old), w.currentDocument.exists === false ? false : true);
        if (old) assert.equal(old.updateTime, w.currentDocument.updateTime);
      }
      for (const w of body.writes) {
        const old = docs.get(w.update.name);
        docs.set(w.update.name, { name: w.update.name, fields: { ...old?.fields, ...w.update.fields }, updateTime: String(Number(old?.updateTime || 0) + 1) });
      }
      return {};
    }
    throw Error('Unexpected endpoint');
  };
  return { docs, calls, seed, data, post };
}
test('imports review and both mirrors; unchanged rerun reads only checkpoint and writes nothing', async () => {
  const db = database();
  const first = await syncReviews([row], db.post, { apply: true });
  assert.equal(first.newReviews, 1); assert.equal(first.writes, 4);
  assert.equal(db.docs.size, 4);
  db.calls.length = 0;
  const second = await syncReviews([row], db.post, { apply: true });
  assert.equal(second.writes, 0); assert.equal(second.unchangedReviews, 1);
  assert.equal(db.calls.length, 1);
});
test('source edits preserve manual employee and shift links and do not rewrite unchanged signal', async () => {
  const db = database(); await syncReviews([row], db.post, { apply: true });
  const reviewPath = `${app}/reviews/${hash(row.review_id)}`;
  db.seed(reviewPath, { ...db.data(reviewPath), linkedEmployeeIds: ['test-employee'], linkedShiftId: 'manual-shift' });
  const eventPath = `${app}/timeline/${hash(row.review_id)}`;
  db.seed(eventPath, { ...db.data(eventPath), employees: [{ id: 'test-employee', name: 'اسم تجريبي' }], employeeIds: ['test-employee'] });
  const edited = { ...row, review_comment: 'تعديل' };
  const result = await syncReviews([edited], db.post, { apply: true });
  assert.equal(result.updatedReviews, 1);
  assert.deepEqual(db.data(reviewPath).linkedEmployeeIds, ['test-employee']);
  assert.equal(db.data(reviewPath).linkedShiftId, 'manual-shift');
  assert.deepEqual(db.data(eventPath).employeeIds, ['test-employee']);
});
test('invalid or empty response cannot delete records or commit a checkpoint', async () => {
  const db = database(); await syncReviews([row], db.post, { apply: true });
  const size = db.docs.size; db.calls.length = 0;
  await syncReviews([], db.post, { apply: true });
  assert.equal(db.calls.length, 0); assert.equal(db.docs.size, size);
  await assert.rejects(syncReviews([row, { ...row, review_id: 'bad', account_id: 'unknown' }], db.post, { apply: true }));
  assert.equal(db.calls.length, 0);
});
test('cross-midnight shifts match next day and latest start wins', () => {
  const shifts = [{ id: 'night', branch: 'شرق', date: '14-10-2026', time: '16:00', endTime: '07:00', employees: [{ id: 'test' }] }];
  assert.equal(findShift({ branch: 'شرق', date: '15-10-2026', time: '02:00' }, shifts)?.id, 'night');
  assert.equal(findShift({ branch: 'شرق', date: '15-10-2026', time: '08:00' }, shifts), undefined);
});
test('failed commits cannot advance checkpoint; retry repairs safely', async () => {
  const db = database();
  await assert.rejects(syncReviews([row], async (url, body) => {
    if (url.endsWith(':commit')) throw Error('conflict');
    return db.post(url, body);
  }, { apply: true }));
  assert.equal(db.docs.size, 0);
  assert.equal((await syncReviews([row], db.post, { apply: true })).newReviews, 1);
});
test('Windsor network errors cannot expose API keys', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => { throw Error(String(url)); };
    await assert.rejects(fetchSnapshot('SECRET-TEST', '2026-10-01', '2026-10-19'), error => !error.message.includes('SECRET-TEST') && error.message === 'Windsor connection failed');
  } finally { globalThis.fetch = original; }
});
