import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { seaFleetLayout } = await import(moduleUrl('seaFleetLayout'));

test('fixed spacing fits every cutout without overlap or aligned rows/columns across screen sizes', () => {
  for (const [width, height] of [[320, 608], [390, 768], [768, 768], [1440, 930]]) {
    for (const rescueCount of [0, 1, 3, 6]) {
      const vessels = Array.from({ length: 6 }, (_, index) => ({ name: String(index),
        width: index < rescueCount ? Math.min(width * .44, 288) * .85 : (width < 761 ? 108 : 200) * 1.3,
        height: index < rescueCount ? 130 : (width < 761 ? 108 : 200) * 1.3 * 5 / 3,
        preferredX: [.68, .27, .75, .20, .77, .28][index], order: index }));
      const positions = seaFleetLayout(vessels, width, height);
      assert.equal(positions.length, 6);
      assert.deepEqual(positions, seaFleetLayout([...vessels].reverse(), width, height));
      const unit = Math.max(4.5, Math.min(9, width * .015));
      const boxes = positions.map(position => {
        const vessel = vessels.find(item => item.name === position.name);
        return { ...position, left: position.x - vessel.width * position.fit / 2,
          right: position.x + vessel.width * position.fit / 2, top: position.y - vessel.height * position.fit };
      });
      for (const [index, a] of boxes.entries()) {
        assert.ok(a.left >= unit - .01 && a.right <= width - unit + .01);
        assert.ok(a.top >= height * .35 - .01 && a.y <= height - unit + .01);
        for (const b of boxes.slice(index + 1)) {
          assert.ok(Math.abs(a.x - b.x) >= unit * 2 - .01);
          assert.ok(b.y - a.y >= unit * 3 - .01);
          assert.ok(a.right + unit <= b.left + .01 || b.right + unit <= a.left + .01
            || a.y + unit * 3 <= b.top + .01 || b.y + unit * 2 <= a.top + .01);
        }
      }
    }
  }
});
