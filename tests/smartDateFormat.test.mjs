import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime, formatDate } from '../src/lib/formatDate.ts';

test('smart formatDateTime formats today, yesterday, day before yesterday with time, and older dates without time', () => {
  // Get current date in Asia/Riyadh
  const riyadhNowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()).split('-').map(Number);

  const [year, month, day] = riyadhNowParts;

  const pad = (n) => String(n).padStart(2, '0');
  const makeDateKey = (d, m, y) => `${pad(d)}-${pad(m)}-${y}`;

  // Today
  const todayKey = makeDateKey(day, month, year);
  const todayFormatted = formatDateTime(todayKey, '14:30');
  assert.match(todayFormatted, /^اليوم،/);

  // Yesterday
  const yesterdayDate = new Date(Date.UTC(year, month - 1, day - 1));
  const yesterdayKey = makeDateKey(yesterdayDate.getUTCDate(), yesterdayDate.getUTCMonth() + 1, yesterdayDate.getUTCFullYear());
  const yesterdayFormatted = formatDateTime(yesterdayKey, '09:15');
  assert.match(yesterdayFormatted, /^أمس،/);

  // Day before yesterday
  const dayBeforeDate = new Date(Date.UTC(year, month - 1, day - 2));
  const dayBeforeKey = makeDateKey(dayBeforeDate.getUTCDate(), dayBeforeDate.getUTCMonth() + 1, dayBeforeDate.getUTCFullYear());
  const dayBeforeFormatted = formatDateTime(dayBeforeKey, '20:00');
  assert.match(dayBeforeFormatted, /^أول أمس،/);

  // Older date (e.g. 5 days ago)
  const olderDate = new Date(Date.UTC(year, month - 1, day - 5));
  const olderKey = makeDateKey(olderDate.getUTCDate(), olderDate.getUTCMonth() + 1, olderDate.getUTCFullYear());
  const olderFormatted = formatDateTime(olderKey, '11:20');
  // Must NOT contain time and must be only the date
  assert.doesNotMatch(olderFormatted, /م|ص|:/);
  assert.strictEqual(olderFormatted, formatDate(olderKey));
});
