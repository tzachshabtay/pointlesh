import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CharacterController, isSegmentWalkable, pointInPolygon } from '@pointlesh/core';
import { PhaserAdventureNavigation } from '../dist/navigation.js';

const floor = [[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }]];
function setup(kind = 'character') {
  const scene = { events: new EventEmitter() };
  const world = new PhaserAdventureNavigation(scene, () => floor);
  const sprite = (x, y) => Object.assign(new EventEmitter(), { scene, x, y, active: true, visible: true,
    displayWidth: 40, displayHeight: 80, getWorldTransformMatrix() { return { tx: this.x, ty: this.y }; } });
  const mover = sprite(30, 100), obstacle = sprite(150, 100), properties = {};
  const controller = new CharacterController({ id: 'hero', position: { x: 30, y: 100 }, speed: 100, movementLinkedToAnimation: false });
  world.register(mover, { kind: 'character', controller });
  world.register(obstacle, { kind, properties: () => properties });
  return { world, controller, mover, obstacle, properties, scene };
}

for (const kind of ['character', 'object']) test(`${kind} blocks by default with body clearance and WalkThrough allows direct paths`, async () => {
  const { world, controller, mover, obstacle, properties } = setup(kind);
  const finish = controller.walkTo({ x: 270, y: 100 });
  assert.ok(controller.state.path.length >= 3);
  let previous = controller.state.position;
  for (const point of controller.state.path) {
    assert.equal(isSegmentWalkable(previous, point, floor, world.obstaclesFor(mover)), true);
    previous = point;
  }
  for (let i = 0; i < 50; i++) {
    controller.tick(100);
    assert.equal(world.obstaclesFor(mover).some(p => pointInPolygon(controller.state.position, p, false)), false);
  }
  assert.equal(await finish, true);
  controller.place({ x: 30, y: 100 });
  properties.walkThrough = true;
  controller.walkTo({ x: 270, y: 100 });
  assert.deepEqual(controller.state.path, [{ x: 270, y: 100 }]);
  properties.walkThrough = false;
  obstacle.visible = false;
  assert.deepEqual(world.obstaclesFor(mover), []);
  obstacle.visible = true;
  obstacle.emit('destroy');
  assert.deepEqual(world.obstaclesFor(mover), []);
});

test('held input clips a large step, follows live property edits, and never includes itself', () => {
  const { world, controller, mover, properties } = setup();
  assert.equal(world.obstaclesFor(mover).length, 1);
  controller.setMovementDirection({ x: 1, y: 0 });
  controller.tick(2000);
  assert.deepEqual(controller.state.position, { x: 126, y: 100 });
  controller.tick(1000);
  assert.equal(controller.state.activity, 'idle');
  properties.walkThrough = true;
  controller.tick(1000);
  assert.deepEqual(controller.state.position, { x: 226, y: 100 });
});

test('moving blockers reroute pending and restored walks without resetting completion', async () => {
  const { world, controller, mover, obstacle } = setup();
  obstacle.y = 30;
  const finish = controller.walkTo({ x: 270, y: 100 });
  controller.tick(200);
  const saved = controller.snapshot();
  obstacle.y = 100;
  controller.tick(100);
  assert.ok(controller.state.path.length >= 3);
  const restored = new CharacterController(controller.config);
  const detach = restored.setNavigationSource(() => ({ walkables: floor, obstacles: world.obstaclesFor(mover) }));
  restored.restore(saved);
  restored.tick(100);
  assert.deepEqual(restored.snapshot(), controller.snapshot());
  controller.tick(5000);
  assert.equal(await finish, true);
  detach();
});

test('implicit approaches and blocked walk points stop at the closest reachable solid boundary', async () => {
  const { controller } = setup();
  const approach = controller.approach({ position: { x: 150, y: 100 } }, 'walk');
  controller.tick(5000);
  assert.equal(await approach, true);
  assert.deepEqual(controller.state.position, { x: 150, y: 92 });
  controller.place({ x: 30, y: 100 });
  const explicit = controller.approach({ position: { x: 150, y: 100 }, walkPoint: { x: 150, y: 100 } }, 'walk');
  assert.deepEqual(controller.destination, { x: 150, y: 92 });
  controller.tick(5000);
  assert.equal(await explicit, true);
  assert.deepEqual(controller.state.position, { x: 150, y: 92 });
  assert.equal(controller.state.facing, 'down');
});

test('hidden/disabled bodies and scene shutdown remove obstacles and controller bindings', () => {
  const { world, mover, obstacle, properties, scene, controller } = setup();
  properties.enabled = false;
  assert.deepEqual(world.obstaclesFor(mover), []);
  properties.enabled = true;
  obstacle.active = false;
  assert.deepEqual(world.obstaclesFor(mover), []);
  obstacle.active = true;
  scene.events.emit('shutdown');
  assert.deepEqual(world.obstaclesFor(mover), []);
  controller.walkTo({ x: 270, y: 100 }, floor);
  assert.deepEqual(controller.state.path, [{ x: 270, y: 100 }]);
});
