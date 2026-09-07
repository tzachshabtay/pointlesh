import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterController, facingDirection, assertCharacterSnapshot } from '../dist/index.js';

const floor = [[{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }]];
const create = options => new CharacterController({ id: 'dwarf', position: { x: 10, y: 10 }, frameDurationMs: 100, walkStep: 10, ...options });

test('linked displacement follows frame changes, while frame timing controls speed', async () => {
  const actor = create();
  const result = actor.walkTo({ x: 100, y: 10 }, floor);
  actor.tick(99);
  assert.equal(actor.state.position.x, 10);
  actor.tick(1);
  assert.equal(actor.state.position.x, 20);
  actor.tick(800);
  assert.equal(await result, true);
  assert.equal(actor.state.position.x, 100);
  assert.equal(actor.state.activity, 'idle');
  assert.equal(actor.state.facing, 'right');
});

test('elapsed-time stepping is independent of tick partition and single-frame walks stay smooth', async () => {
  const smallTicks = create(), largeTick = create();
  smallTicks.walkTo({ x: 190, y: 10 }, floor);
  largeTick.walkTo({ x: 190, y: 10 }, floor);
  for (let i = 0; i < 30; i++) smallTicks.tick(17);
  largeTick.tick(510);
  assert.deepEqual(smallTicks.snapshot(), largeTick.snapshot());
  const stillArt = create({ frameCount: 1, speed: 100 });
  const completion = stillArt.walkTo({ x: 110, y: 10 }, floor);
  stillArt.tick(50);
  assert.equal(stillArt.state.position.x, 15);
  stillArt.tick(950);
  assert.equal(await completion, true);
});

test('perspective scaling adjusts displacement and stopping/replacement resolves old work', async () => {
  const actor = create();
  actor.setScale(0.5);
  const oldWalk = actor.walkTo({ x: 100, y: 10 }, floor);
  actor.tick(100);
  assert.equal(actor.state.position.x, 15);
  const newWalk = actor.walkTo({ x: 15, y: 30 }, floor);
  assert.equal(await oldWalk, false);
  actor.tick(400);
  assert.equal(await newWalk, true);
  const stopped = actor.walkTo({ x: 100, y: 30 }, floor);
  actor.stop();
  assert.equal(await stopped, false);
  assert.equal(actor.state.activity, 'idle');
});

test('approach stands at the walk point then faces target; unreachable approach never succeeds', async () => {
  const actor = create({ movementLinkedToAnimation: false, speed: 100 });
  const approach = actor.approach({ position: { x: 100, y: 100 }, walkPoint: { x: 100, y: 70 } }, 'walk-if-point', floor);
  actor.tick(2000);
  assert.equal(await approach, true);
  assert.deepEqual(actor.state.position, { x: 100, y: 70 });
  assert.equal(actor.state.facing, 'down');
  assert.equal(await actor.approach({ position: { x: 300, y: 70 } }, 'walk', floor), false);
});

test('speech interrupts walking and old completions cannot overwrite newer activity', async () => {
  const actor = create();
  const walking = actor.walkTo({ x: 100, y: 10 }, floor);
  const speaking = actor.say('For the king!', 300);
  assert.equal(await walking, false);
  actor.tick(200);
  assert.equal(actor.state.activity, 'speaking');
  const replacement = actor.walkTo({ x: 30, y: 10 }, floor);
  await speaking;
  assert.equal(actor.state.activity, 'walking');
  actor.tick(200);
  assert.equal(await replacement, true);
  const finalSpeech = actor.say('Done', 200);
  actor.tick(200);
  await finalSpeech;
  assert.equal(actor.state.activity, 'idle');
});

test('fresh controller restores active path and speech state without losing their progress', async () => {
  const original = create();
  original.walkTo({ x: 100, y: 10 }, floor);
  original.tick(250);
  const restored = create();
  restored.restore(original.snapshot());
  original.tick(750);
  restored.tick(750);
  assert.deepEqual(restored.snapshot(), original.snapshot());
  original.say('Almost there', 300);
  original.tick(100);
  restored.restore(original.snapshot());
  restored.tick(200);
  assert.equal(restored.state.activity, 'idle');
  assert.throws(() => restored.restore({ ...original.snapshot(), position: { x: NaN, y: 0 } }), /snapshot/);
});

test('facing uses browser coordinates and supports both four- and eight-direction sets', () => {
  assert.equal(facingDirection({ x: 0, y: 0 }, { x: 0, y: 1 }), 'down');
  assert.equal(facingDirection({ x: 0, y: 0 }, { x: -1, y: -1 }), 'up-left');
  assert.equal(facingDirection({ x: 0, y: 0 }, { x: 1, y: 0.2 }, 4), 'right');
  assert.equal(facingDirection({ x: 0, y: 0 }, { x: 0, y: 0 }, 4, 'left'), 'left');
});

test('walkTo snaps clicks by default while exact options and approach still reject unreachable targets', async () => {
  const actor = create({ movementLinkedToAnimation: false, speed: 100 });
  const walking = actor.walkTo({ x: 300, y: 10 }, floor);
  assert.deepEqual(actor.destination, { x: 200, y: 10 });
  actor.tick(2000);
  assert.equal(await walking, true);
  assert.deepEqual(actor.state.position, { x: 200, y: 10 });
  assert.equal(await actor.walkTo({ x: 300, y: 10 }, floor, [], { snap: false }), false);
  assert.equal(await actor.approach({ position: { x: 300, y: 10 } }, 'walk', floor), false);
});

test('repeated held-direction updates and direction changes preserve linked frame accumulation', () => {
  const actor = create({ position: { x: 100, y: 100 } });
  actor.setMovementDirection({ x: 1, y: 0 }, floor);
  actor.tick(40);
  actor.setMovementDirection({ x: 1, y: 0 }, floor);
  actor.tick(40);
  actor.setMovementDirection({ x: 0, y: -1 }, floor);
  actor.tick(19);
  assert.deepEqual(actor.state.position, { x: 100, y: 100 });
  actor.tick(1);
  assert.deepEqual(actor.state.position, { x: 100, y: 90 });
  assert.equal(actor.state.facing, 'up');
  assert.equal(actor.state.animationFrame, 1);
  actor.setMovementDirection(null, floor);
  actor.tick(1000);
  assert.deepEqual(actor.state.position, { x: 100, y: 90 });
  assert.equal(actor.state.activity, 'idle');
});

test('directional movement normalizes diagonals and uses the same perspective speed', () => {
  const actor = create({ movementLinkedToAnimation: false, speed: 100 });
  actor.setScale(0.5);
  actor.setMovementDirection({ x: 1, y: 1 }, floor);
  actor.tick(1000);
  assert.ok(Math.abs(Math.hypot(actor.state.position.x - 10, actor.state.position.y - 10) - 50) < 1e-8);
  assert.equal(actor.state.facing, 'down-right');
});

test('held direction clips large linked steps to walls and can turn along the boundary', () => {
  const actor = create({ position: { x: 10, y: 50 }, walkStep: 100 });
  const wall = [[{ x: 40, y: 0 }, { x: 40.001, y: 0 }, { x: 40.001, y: 200 }, { x: 40, y: 200 }]];
  actor.setMovementDirection({ x: 1, y: 0 }, floor, wall);
  actor.tick(100);
  assert.deepEqual(actor.state.position, { x: 40, y: 50 });
  actor.tick(100);
  assert.deepEqual(actor.state.position, { x: 40, y: 50 });
  assert.equal(actor.state.activity, 'idle');
  actor.setMovementDirection({ x: 0, y: -1 }, floor, wall);
  actor.tick(100);
  assert.deepEqual(actor.state.position, { x: 40, y: 0 });
});

test('key release does not cancel a click walk, but directional input interrupts it', async () => {
  const actor = create();
  const click = actor.walkTo({ x: 50, y: 10 }, floor);
  actor.setMovementDirection(null, floor);
  actor.tick(400);
  assert.equal(await click, true);
  const replaced = actor.walkTo({ x: 100, y: 10 }, floor);
  actor.setMovementDirection({ x: 0, y: 1 }, floor);
  assert.equal(await replaced, false);
  actor.tick(100);
  assert.deepEqual(actor.state.position, { x: 50, y: 20 });
});

test('saving held-key movement keeps the pose but does not restore a stuck input direction', () => {
  const actor = create();
  actor.setMovementDirection({ x: 1, y: 0 }, floor); actor.tick(150);
  const snapshot = actor.snapshot();
  assertCharacterSnapshot(snapshot);
  assert.equal(snapshot.activity, 'idle');
  const restored = create(); restored.restore(snapshot); restored.tick(1000);
  assert.deepEqual(restored.state.position, actor.state.position);
  assert.equal(restored.state.activity, 'idle');
});
