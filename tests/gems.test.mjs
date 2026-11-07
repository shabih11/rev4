import { moduleUrl } from './helpers/typescript.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { gemTheme } = await import(moduleUrl('gems'));
test('visitor theme follows the displayed employee and independent theme switch', () => {
 const state = { settings: { themes: true, boxes: false, price: 50 }, equipped: { a: 'emerald', b: 'rose' } };
 assert.equal(gemTheme(state, 'a'), 'emerald');
 assert.equal(gemTheme(state, 'b'), 'rose');
 assert.equal(gemTheme(state, 'c'), undefined);
 assert.equal(gemTheme({ ...state, settings: { ...state.settings, themes: false, boxes: true } }, 'a'), undefined);
 assert.equal(gemTheme({ ...state, equipped: { a: 'unknown' } }, 'a'), undefined);
 assert.equal(gemTheme(null, 'a'), undefined);
});
