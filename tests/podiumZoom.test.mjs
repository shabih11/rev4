import { moduleUrl } from './helpers/typescript.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { zoomPodiumAtPoint } = await import(moduleUrl('podiumZoom'));
const anchor = { width: 390, fit: 0.3, zoom: 1, nextZoom: 2, scrollLeft: 0, scrollTop: 0, x: 195, y: 100 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test('pinch zoom preserves the point under the fingers in a fitted mobile scene', () => {
  const result = zoomPodiumAtPoint(anchor);
  assert.equal(result.zoom, 2);
  close(result.scrollLeft, 183);
  close(result.scrollTop, 84);
});
test('mouse wheel zoom accounts for the centered scene on a wide desktop viewport', () => {
  const result = zoomPodiumAtPoint({ ...anchor, width: 1440, fit: 1, x: 400 });
  close(result.scrollLeft, 192);
});
test('moving the pinch midpoint pans without losing the original scene anchor', () => {
  const result = zoomPodiumAtPoint({ ...anchor, nextX: 215, nextY: 130 });
  close(result.scrollLeft, 163);
  close(result.scrollTop, 54);
});
test('gesture zoom is bounded and invalid zoom input preserves the current level', () => {
  assert.equal(zoomPodiumAtPoint({ ...anchor, nextZoom: 0.2 }).zoom, 1);
  assert.equal(zoomPodiumAtPoint({ ...anchor, nextZoom: 100 }).zoom, 6);
  assert.equal(zoomPodiumAtPoint({ ...anchor, zoom: 2, nextZoom: NaN }).zoom, 2);
});
