import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const { liftCinematicWorld } = await tsImport('../src/cinematic-framing.ts', import.meta.url);

test('forest march can move up without exposing scenery below the caption', () => {
  const zoom = 1.09, y = 540 - 540 * zoom;
  const framed = liftCinematicWorld(y, 540, zoom, 540, 50, 32);
  assert.equal(framed, y - 32);
  assert.ok(framed + 540 * zoom >= 490);
});
test('camera pan is limited by the actual overlay and never exposes the bottom edge', () => {
  for (const covered of [0, 8, 20, 50]) {
    const framed = liftCinematicWorld(-54, 540, 1.1, 540, covered, 32);
    assert.ok(framed + 540 * 1.1 >= 540 - covered - 1e-8);
    assert.ok(framed >= -86);
  }
});
test('the initial title and ending handoff remain at the original camera pose', () => {
  assert.equal(liftCinematicWorld(-30, 540, 1.1, 540, 50, 0), -30);
});
