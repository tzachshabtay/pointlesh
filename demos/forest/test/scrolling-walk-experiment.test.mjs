import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const { ScrollingWalkExperiment } = await tsImport('../src/scrolling-walk-experiment.ts', import.meta.url);

test('camera movement enables smooth walking, then settles back without toggling in frame gaps', () => {
  const mode = new ScrollingWalkExperiment();
  mode.begin('forest', true);
  mode.observe({ x: 0, y: 0 }, { x: 0, y: 0 }, 16, 1);
  assert.equal(mode.active, false);
  mode.observe({ x: 0, y: 0 }, { x: 1, y: 0 }, 16, 1);
  assert.equal(mode.active, true);
  mode.observe({ x: 1, y: 0 }, { x: 1, y: 0 }, 100, 1);
  assert.equal(mode.active, true);
  mode.observe({ x: 1, y: 0 }, { x: 1.00001, y: 0 }, 80, 1);
  assert.equal(mode.active, false);
});

test('room switches and suspended camera control clear the experiment', () => {
  const mode = new ScrollingWalkExperiment();
  mode.begin('forest', true);
  mode.observe({ x: 0, y: 0 }, { x: 10, y: 0 }, 16, 1);
  mode.begin('mine', true);
  assert.equal(mode.active, false);
  mode.observe({ x: 0, y: 0 }, { x: 10, y: 0 }, 16, 1);
  mode.begin('mine', false);
  assert.equal(mode.active, false);
});


test('a walk across the forest changes linked → smooth → linked as the camera reaches room edges', async () => {
  const { CharacterController } = await import('@pointlesh/core');
  const { PhaserRoomCamera } = await tsImport('../../../packages/phaser/src/room-camera.ts', import.meta.url);
  const actor = new CharacterController({ id: 'borin', position: { x: 300, y: 480 }, walkStep: 16, frameCount: 8, frameDurationMs: 100, speed: 999 });
  const camera = { width: 960, height: 540, zoomX: 1, zoomY: 1, originX: 0.5, originY: 0.5, scrollX: 0, scrollY: 0,
    setScroll(x, y) { this.scrollX = x; this.scrollY = y; } };
  const follow = new PhaserRoomCamera(camera, { room: { width: 1620, height: 540 }, target: () => actor.state.position });
  const mode = new ScrollingWalkExperiment();
  actor.walkTo({ x: 1570, y: 480 }, [[{ x: 0, y: 0 }, { x: 1620, y: 0 }, { x: 1620, y: 540 }, { x: 0, y: 540 }]]);
  let smoothTicks = 0, linkedAfterScrolling = 0, staticLinkedTicks = 0;
  for (let i = 0; i < 600 && actor.isWalking; i++) {
    mode.begin('forest', true);
    const before = { x: camera.scrollX, y: camera.scrollY }, position = actor.state.position.x;
    const smooth = mode.active;
    actor.tick(16, { smoothLinkedMovement: smooth });
    if (smooth && actor.isWalking) {
      smoothTicks++;
      assert.ok(Math.abs(actor.state.position.x - position - 2.56) < 1e-8);
    } else if (actor.isWalking && smoothTicks) linkedAfterScrolling++;
    else if (actor.isWalking) staticLinkedTicks++;
    follow.update(16);
    mode.observe(before, { x: camera.scrollX, y: camera.scrollY }, 16, 1);
  }
  assert.ok(staticLinkedTicks > 10);
  assert.ok(smoothTicks > 100);
  assert.ok(linkedAfterScrolling > 10);
  assert.equal(actor.state.position.x, 1570);
});
