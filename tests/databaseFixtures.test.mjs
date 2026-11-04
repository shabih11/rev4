import { test } from 'node:test';
import assert from 'node:assert/strict';
import { securityFixturesForMonth } from '../automation/database-fixtures.mjs';

test('SQL fixtures remain in the open month with the same weekday and overnight boundary across years', () => {
  for (const today of ['2026-11-01', '2027-02-28', '2028-02-29', '2027-12-31']) {
    const sql = securityFixturesForMonth('21-10-2026 22-10-2026 23-10-2026 2026-10-21T13:00:00Z 31-02-2026', today);
    const [wed, thu, fri, stamp, invalid] = sql.split(' ');
    const day = text => { const [d,m,y] = text.split('-'); return new Date(`${y}-${m}-${d}T00:00:00Z`); };
    assert.equal(day(wed).getUTCDay(), 3);
    assert.equal(day(thu).getUTCDay(), 4);
    assert.equal(day(fri).getUTCDay(), 5);
    assert.equal(day(thu) - day(wed), 86400000);
    assert.equal(day(wed).toISOString().slice(0, 7), today.slice(0, 7));
    assert.equal(stamp.slice(0, 10), day(wed).toISOString().slice(0, 10));
    assert.equal(invalid, '31-02-2026');
  }
});
