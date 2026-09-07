import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainAreaHandle } from '../dist/area-edge-handles.js';

const viewport = { left: 100, top: 50, right: 500, bottom: 350 };

test('offscreen area grips are inset without changing the authored point', () => {
  const vertex = Object.freeze({ x: 96.7, y: 410 });
  assert.deepEqual(constrainAreaHandle(vertex, viewport), { x: 107, y: 343 });
  assert.deepEqual(vertex, { x: 96.7, y: 410 });
  assert.deepEqual(constrainAreaHandle({ x: 230, y: 180 }, viewport), { x: 230, y: 180 });
});

test('grips move to the nearest free panel edge and remain separate at corners', () => {
  const dock = { left: 300, top: 50, right: 500, bottom: 350 };
  assert.deepEqual(constrainAreaHandle({ x: 490, y: 200 }, viewport, [dock]), { x: 293, y: 200 });
  const first = constrainAreaHandle({ x: 0, y: 0 }, viewport);
  const occupied = { left: first.x - 5.5, right: first.x + 5.5, top: first.y - 5.5, bottom: first.y + 5.5 };
  const second = constrainAreaHandle({ x: 0, y: 0 }, viewport, [occupied]);
  assert.ok(Math.hypot(second.x - first.x, second.y - first.y) >= 12.5);
  assert.ok(second.x >= 107 && second.y >= 57 && second.x <= 493 && second.y <= 343);
});

test('no grip is placed over a fully covering panel or a collapsed viewport', () => {
  assert.equal(constrainAreaHandle({ x: 100, y: 60 }, viewport, [{ left: 0, top: 0, right: 1000, bottom: 1000 }]), undefined);
  assert.equal(constrainAreaHandle({ x: 0, y: 0 }, { left: 0, top: 0, right: 12, bottom: 10 }), undefined);
  assert.equal(constrainAreaHandle({ x: NaN, y: 0 }, viewport), undefined);
});
