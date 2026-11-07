import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const toModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64');
const dates = toModule(readFileSync(new URL('../src/lib/formatDate.ts', import.meta.url), 'utf8'));
const schedule = toModule(readFileSync(new URL('../src/lib/shiftSchedule.ts', import.meta.url), 'utf8').replace("'./formatDate'", `'${dates}'`));
const { normalizeFridayShift } = await import(schedule);
test('Thursday second shift spans to Friday 14:00 across month/year boundaries and date formats', () => {
  for (const date of ['31-12-2026', '2026-12-31', '٣١-١٢-٢٠٢٦']) {
    const shift = { type: 'shift', date, time: '16:00', endTime: '07:00', endDate: '2027-01-01', employees: ['e'] };
    const normalized = normalizeFridayShift(shift);
    assert.equal(normalized.endTime, '14:00');
    assert.equal(normalized.endDate, '2027-01-01');
    assert.equal(normalized.time, '16:00');
    assert.deepEqual(normalized.employees, ['e']);
    assert.equal(shift.endTime, '07:00');
  }
});
test('Friday first starts at 14:00; other shifts and non-shifts stay unchanged', () => {
  assert.equal(normalizeFridayShift({ type: 'shift', date: '30-10-2026', time: '07:00', endTime: '16:00' }).time, '14:00');
  for (const row of [
    { type: 'shift', date: '28-10-2026', time: '16:00', endTime: '07:00' },
    { type: 'shift', date: '30-10-2026', time: '16:00', endTime: '07:00' },
    { type: 'shift', date: '29-10-2026', time: '07:00', endTime: '16:00' },
    { type: 'gap', date: '29-10-2026', time: '16:00' },
  ]) assert.deepEqual(normalizeFridayShift(row), row);
});
