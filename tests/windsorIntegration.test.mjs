import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
let source = readFileSync(new URL('../src/lib/windsorIntegration.ts', import.meta.url), 'utf8');
const formatSource = ts.transpileModule(readFileSync(new URL('../src/lib/formatDate.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
source = source.replace("'./formatDate'", JSON.stringify('data:text/javascript;base64,' + Buffer.from(formatSource).toString('base64')));
source = source.replace("'./windsorReviewModel.mjs'", JSON.stringify(new URL('../src/lib/windsorReviewModel.mjs', import.meta.url).href));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { normalizeWindsorReviews, stripReviewTranslation } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const row = { account_id: 'locations/123', review_id: 'review-1', review_reviewer: 'عميل تجريبي', review_star_rating: 'FIVE', review_comment: 'ممتاز', review_create_time: '2026-10-10T22:30:00Z' };
test('maps Windsor data, converts midnight to Riyadh, and deduplicates', () => {
  const rows = normalizeWindsorReviews({ data: [row, row] }, { 'locations/123': 'جاليري' });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { id: 'review-1', reviewerName: 'عميل تجريبي', rating: '5', comment: 'ممتاز', date: '11-10-2026', time: '01:30', branch: 'جاليري' });
});
test('strips automated Google translations from review comments', () => {
  const sampleWithTrans = 'المكان جميل جداً (Translated by Google) The place is very nice';
  assert.equal(stripReviewTranslation(sampleWithTrans), 'المكان جميل جداً');

  const sampleOriginal = '(Translated by Google) Bad service (Original) خدمة سيئة';
  assert.equal(stripReviewTranslation(sampleOriginal), 'خدمة سيئة');

  const rowWithTrans = { ...row, review_id: 'review-2', review_comment: sampleWithTrans };
  const rows = normalizeWindsorReviews([rowWithTrans], { 'locations/123': 'جاليري' });
  assert.equal(rows[0].comment, 'المكان جميل جداً');
});
test('rejects unmapped locations and invalid review values', () => {
  assert.throws(() => normalizeWindsorReviews([row]), /حدد الفرع/);
  assert.throws(() => normalizeWindsorReviews([{ ...row, review_star_rating: null }], { 'locations/123': 'سلام' }), /نجوم/);
  assert.throws(() => normalizeWindsorReviews([{ ...row, review_create_time: null }], { 'locations/123': 'سلام' }), /تاريخ/);
  assert.deepEqual(normalizeWindsorReviews([{ account_id: '123', review_count: 12 }]), []);
});
