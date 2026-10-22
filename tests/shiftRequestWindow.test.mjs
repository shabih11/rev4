import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(compile('../src/lib/formatDate.ts'));
const { canRequestShift, canAppeal } = await import(url(compile('../src/lib/shiftRequestWindow.ts').replace("'./formatDate'", JSON.stringify(formatUrl))));
test('request window includes today and two previous Riyadh calendar days only', () => {
  const now = Date.parse('2026-10-22T12:00:00+03:00');
  for (const date of ['22-10-2026','21-10-2026','20-10-2026']) assert.equal(canRequestShift(date, now), true);
  for (const date of ['19-10-2026','23-10-2026','31-02-2026','invalid']) assert.equal(canRequestShift(date, now), false);
});
test('request window rolls over at Riyadh midnight across month and year boundaries', () => {
  const now = Date.parse('2027-01-01T00:00:00+03:00');
  assert.equal(canRequestShift('30-12-2026', now), true);
  assert.equal(canRequestShift('29-12-2026', now), false);
  assert.equal(canRequestShift('29-12-2026', now - 1), true);
});
test('appeal expires exactly 72 hours after rejection and fails closed without a timestamp', () => {
  const rejected = Date.parse('2026-10-22T12:00:00+03:00');
  assert.equal(canAppeal(rejected, rejected), true);
  assert.equal(canAppeal(rejected, rejected + 259200000 - 1), true);
  assert.equal(canAppeal(rejected, rejected + 259200000), false);
  assert.equal(canAppeal(rejected, rejected - 1), false);
  assert.equal(canAppeal(undefined, rejected), false);
});
