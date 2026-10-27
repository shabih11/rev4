import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/arabicReviewCount.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { arabicReviewCount } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('Arabic review count agrees across zero, singular, dual, plural and large counts', () => {
  for (const [count, expected] of [[0,'بدون تقييمات'],[1,'تقييم واحد'],[2,'تقييمان'],[3,'3 تقييمات'],[10,'10 تقييمات'],[11,'11 تقييمًا'],[100,'100 تقييم'],[103,'103 تقييمات'],[1.5,'1.5 تقييمًا']]) assert.equal(arabicReviewCount(count), expected);
});
test('positive, negative and shared adjectives agree with each count', () => {
  assert.equal(arabicReviewCount(0, 'negative'), 'بدون تقييمات سلبية');
  assert.equal(arabicReviewCount(1, 'negative'), 'تقييم سلبي واحد');
  assert.equal(arabicReviewCount(2, 'negative'), 'تقييمان سلبيان');
  assert.equal(arabicReviewCount(4, 'negative'), '4 تقييمات سلبية');
  assert.equal(arabicReviewCount(12, 'positive'), '12 تقييمًا إيجابيًا');
  assert.equal(arabicReviewCount(2, 'shared'), 'تقييمان مشتركان');
});
