import assert from 'node:assert/strict';
import test from 'node:test';
import { PhaserRoomCamera } from '../dist/room-camera.js';

function fixture(options = {}) {
  const camera = { width: 960, height: 540, zoomX: 1, zoomY: 1, originX: .5, originY: .5, scrollX: 0, scrollY: 0,
    setScroll(x, y) { this.scrollX = x; this.scrollY = y; } };
  const target = { x: 900, y: 465 };
  const follow = new PhaserRoomCamera(camera, { room: { width: 1620, height: 540 }, target: () => target, ...options });
  const view = () => ({ left: camera.scrollX + camera.width * camera.originX * (1 - 1 / camera.zoomX), right: camera.scrollX + camera.width * camera.originX * (1 - 1 / camera.zoomX) + camera.width / camera.zoomX });
  return { camera, target, follow, view };
}

test('wide room follow is smooth and independent of frame partitioning', () => {
  const whole = fixture(), parts = fixture();
  whole.follow.update(100);
  for (let i = 0; i < 10; i++) parts.follow.update(10);
  assert.ok(whole.camera.scrollX > 0 && whole.camera.scrollX < 420);
  assert.ok(Math.abs(whole.camera.scrollX - parts.camera.scrollX) < 1e-10);
  assert.equal(whole.camera.scrollY, 0);
  whole.follow.snap(); assert.equal(whole.camera.scrollX, 420);
});

test('zoom-aware edges stay inside the room with noncentral camera origins', () => {
  const { camera, target, follow, view } = fixture();
  camera.zoomX = 1.035; camera.originX = .25;
  target.x = -100; follow.snap(); assert.ok(Math.abs(view().left) < 1e-10);
  target.x = 1900; follow.snap(); assert.ok(Math.abs(view().right - 1620) < 1e-10);
  // Zooming out tightens bounds immediately, even on a zero-time update.
  camera.zoomX = 1; follow.update(0); assert.equal(view().right, 1620);
  camera.zoomX = .5; follow.snap();
  assert.ok(Math.abs((view().left + view().right) / 2 - 810) < 1e-10);
});

test('editor suspension keeps its pan/zoom and room transitions restore fixed room framing', () => {
  const { camera, target, follow } = fixture();
  follow.snap(); follow.setEnabled(false);
  camera.scrollX = 630; camera.scrollY = -30; camera.zoomX = camera.zoomY = .7;
  target.x = 100; follow.update(1000);
  assert.equal(camera.scrollX, 630); assert.equal(camera.scrollY, -30); assert.equal(camera.zoomX, .7);
  follow.setRoom({ width: 960, height: 540 }); follow.snap();
  assert.equal(camera.scrollX, 0); assert.equal(camera.scrollY, 0); assert.equal(camera.zoomX, .7);
  for (const zoom of [1, 1.018, 1.035]) {
    camera.zoomX = camera.zoomY = zoom; follow.setEnabled(true); follow.update(1000);
    assert.equal(camera.scrollX, 0); assert.equal(camera.scrollY, 0);
  }
  follow.setRoom({ width: 1620, height: 540 }); target.x = 1385; follow.snap();
  assert.ok(camera.scrollX > 600);
});

test('vertical rooms are optional and invalid updates preserve adopted room bounds', () => {
  const { camera, target, follow } = fixture({ room: { x: 10, y: 20, width: 960, height: 1200 }, axes: 'vertical', smoothing: 0 });
  target.y = 800; follow.update(1); assert.equal(camera.scrollX, 10); assert.equal(camera.scrollY, 530);
  assert.throws(() => follow.setRoom({ width: 0, height: 100 }), /bounds/);
  follow.snap(); assert.equal(camera.scrollY, 530);
  assert.throws(() => follow.update(NaN), /delta/);
  assert.throws(() => fixture({ smoothing: -1 }), /smoothing/);
});
