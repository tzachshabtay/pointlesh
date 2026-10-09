import test from 'node:test';
import assert from 'node:assert/strict';
import { designerViewportBounds } from '../dist/viewport.js';

test('game fits to the left of the actual dock bounds with room for its resize handles', () => {
  const result = designerViewportBounds({ x: 0, y: 0, width: 1440, height: 900 }, { left: 1000, bottom: 850 });
  assert.deepEqual(result, { x: 12, y: 64, width: 976, height: 824 });
  assert.equal(result.x + result.width + 12, 1000);
});

test('moving a panel left or narrowing the browser never collapses the game to zero width', () => {
  assert.equal(designerViewportBounds({ x: 0, y: 0, width: 400, height: 800 }, { left: 0, bottom: 790 }).width, 160);
  assert.equal(designerViewportBounds({ x: 0, y: 0, width: 100, height: 800 }, { left: 0, bottom: 790 }).width, 76);
});

test('a panel at the left edge uses available space below it when possible', () => {
  assert.deepEqual(designerViewportBounds({ x: 20, y: 30, width: 800, height: 900 }, { left: 20, bottom: 400 }),
    { x: 32, y: 440, width: 776, height: 478 });
});
