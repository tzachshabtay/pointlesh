import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterController, facingDirection } from '../dist/index.js';

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
