import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainAreaHandle } from '../dist/area-edge-handles.js';

const viewport = { left: 100, top: 50, right: 500, bottom: 350 };

test('offscreen area grips are inset without changing the authored point', () => {
  const vertex = Object.freeze({ x: 96.7, y: 410 });
  assert.deepEqual(constrainAreaHandle(vertex, viewport, [], 22), { x: 122, y: 328 });
  assert.deepEqual(vertex, { x: 96.7, y: 410 });
  assert.deepEqual(constrainAreaHandle({ x: 230, y: 180 }, viewport, [], 22), { x: 230, y: 180 });
});

test('grips move to the nearest free panel edge and remain separate at corners', () => {
  const dock = { left: 300, top: 50, right: 500, bottom: 350 };
  assert.deepEqual(constrainAreaHandle({ x: 490, y: 200 }, viewport, [dock], 22), { x: 278, y: 200 });
  const first = constrainAreaHandle({ x: 0, y: 0 }, viewport, [], 22);
  const occupied = { left: first.x - 20, right: first.x + 20, top: first.y - 20, bottom: first.y + 20 };
  const second = constrainAreaHandle({ x: 0, y: 0 }, viewport, [occupied], 22);
  assert.ok(Math.hypot(second.x - first.x, second.y - first.y) >= 42);
  assert.ok(second.x >= 122 && second.y >= 72 && second.x <= 478 && second.y <= 328);
});

test('no grip is placed over a fully covering panel or a collapsed viewport', () => {
  assert.equal(constrainAreaHandle({ x: 100, y: 60 }, viewport, [{ left: 0, top: 0, right: 1000, bottom: 1000 }]), undefined);
  assert.equal(constrainAreaHandle({ x: 0, y: 0 }, { left: 0, top: 0, right: 12, bottom: 10 }), undefined);
  assert.equal(constrainAreaHandle({ x: NaN, y: 0 }, viewport), undefined);
});
