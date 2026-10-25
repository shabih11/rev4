import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/gems.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { gemTheme } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('visitor theme follows the displayed employee and independent theme switch', () => {
 const state = { settings: { themes: true, boxes: false, price: 50 }, equipped: { a: 'emerald', b: 'rose' } };
 assert.equal(gemTheme(state, 'a'), 'emerald');
 assert.equal(gemTheme(state, 'b'), 'rose');
 assert.equal(gemTheme(state, 'c'), undefined);
 assert.equal(gemTheme({ ...state, settings: { ...state.settings, themes: false, boxes: true } }, 'a'), undefined);
 assert.equal(gemTheme({ ...state, equipped: { a: 'unknown' } }, 'a'), undefined);
 assert.equal(gemTheme(null, 'a'), undefined);
});
