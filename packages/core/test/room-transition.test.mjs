import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterController, RoomTransitionController, activatePointleshAreas, assertRoomTransitionCheckpoint } from '../dist/index.js';

const from = { roomId: 'a', areaId: 'a.exit', path: [{ x: 20, y: 50 }, { x: 50, y: 50 }, { x: 120, y: 50 }], doorId: 'a.door', doorDurationMs: 100 };
const to = { roomId: 'b', areaId: 'b.entry', path: [{ x: 50, y: 50 }, { x: 0, y: 50 }, { x: -40, y: 50 }], doorId: 'b.door', doorDurationMs: 100 };
const ground = [{ x: -100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: -100, y: 100 }];
function setup() {
  const character = new CharacterController({ id: 'player', position: from.path[0], speed: 100, movementLinkedToAnimation: false });
  character.setNavigationSource(() => ({ walkables: [ground] }));
  const events = [];
  const transition = new RoomTransitionController(character, { enterRoom: portal => events.push(portal.roomId), onComplete: () => events.push('done'), onBlocked: () => events.push('blocked') });
  return { character, transition, events, tick: () => { character.tick(10); transition.update(10); } };
}

test('walks fully out and in, gates the room switch on concealment, and closes both doors', () => {
  const run = setup(); run.transition.begin(from, to);
  const phases = new Set();
  for (let i = 0; i < 1000 && run.transition.active; i++) {
    phases.add(run.transition.phase);
    if (!run.events.length) assert.equal(run.transition.portal.roomId, 'a');
    run.tick();
  }
  assert.deepEqual([...phases], ['open-exit', 'exit', 'close-exit', 'open-entry', 'entry', 'close-entry']);
  assert.deepEqual(run.events, ['b', 'done']);
  assert.deepEqual(run.character.state.position, to.path[0]);
  assert.equal(run.transition.active, false); assert.equal(run.transition.doorProgress, 0);
});

test('every door/walk phase resumes from its exact checkpoint without replaying a room switch', () => {
  const original = setup(); original.transition.begin(from, to);
  const restoredPhases = new Set();
  for (let i = 0; i < 1000 && original.transition.active; i++) {
    const phase = original.transition.phase;
    if (!restoredPhases.has(phase)) {
      const copy = setup(); copy.character.restore(original.character.snapshot()); copy.transition.restore(original.transition.snapshot());
      assert.equal(copy.transition.doorProgress, original.transition.doorProgress);
      for (let j = 0; j < 1000 && copy.transition.active; j++) copy.tick();
      assert.deepEqual(copy.character.state.position, to.path[0]);
      assert.deepEqual(copy.events, phase.includes('entry') ? ['done'] : ['b', 'done']);
      restoredPhases.add(phase);
    }
    original.tick();
  }
  assert.equal(restoredPhases.size, 6);
});

test('activation is transient and cancellation or invalid geometry never switches rooms', () => {
  const authored = [{ id: 'floor', enabled: true }, { id: from.areaId, enabled: false }];
  assert.equal(activatePointleshAreas(authored, [from.areaId])[1].enabled, true);
  assert.equal(authored[1].enabled, false);
  const run = setup(); run.character.setNavigationSource(() => ({ walkables: [] }));
  run.transition.begin(from, to);
  for (let i = 0; i < 30; i++) run.tick();
  assert.deepEqual(run.events, ['blocked']);
  assert.equal(run.transition.active, false);
  assert.throws(() => assertRoomTransitionCheckpoint({ from, to, phase: 'wrong', elapsedMs: 0, waypoint: 0 }));
});

test('doorway concealment reverses on entry, survives a mid-fade save, and resets on cancellation', () => {
  const run = setup();
  run.transition.begin({ ...from, fadeOnLastSegment: true }, { ...to, fadeOnLastSegment: true });
  let exiting = 1, entering = 0, fadedOut = false, fadedIn = false, restored = false;
  for (let i = 0; i < 1000 && run.transition.active; i++) {
    const opacity = run.transition.characterOpacity, phase = run.transition.phase;
    assert.ok(opacity >= 0 && opacity <= 1);
    if (phase === 'open-exit' || phase === 'close-entry') assert.equal(opacity, 1);
    if (phase === 'close-exit' || phase === 'open-entry') assert.equal(opacity, 0);
    if (phase === 'exit') { assert.ok(opacity <= exiting); exiting = opacity; fadedOut ||= opacity > 0 && opacity < 1; }
    if (phase === 'entry') { assert.ok(opacity >= entering); entering = opacity; fadedIn ||= opacity > 0 && opacity < 1; }
    if (!restored && opacity > .2 && opacity < .8) {
      const copy = setup(); copy.character.restore(run.character.snapshot()); copy.transition.restore(run.transition.snapshot());
      assert.equal(copy.transition.characterOpacity, opacity);
      copy.transition.cancel(); assert.equal(copy.transition.characterOpacity, 1);
      restored = true;
    }
    run.tick();
  }
  assert.ok(fadedOut && fadedIn && restored);
  assert.equal(run.transition.characterOpacity, 1);
  assert.deepEqual(run.events, ['b', 'done']);
  const checkpoint = run.transition.snapshot(); assert.equal(checkpoint, null);
  assert.throws(() => assertRoomTransitionCheckpoint({ from: { ...from, fadeOnLastSegment: 'yes' }, to, phase: 'exit', elapsedMs: 0, waypoint: 0 }));
  assert.throws(() => assertRoomTransitionCheckpoint({ from: { ...from, fadeOnLastSegment: true, path: [from.path[0], from.path[0]] }, to, phase: 'exit', elapsedMs: 0, waypoint: 0 }));
});

test('a bent approach cannot fade the actor before the last segment', () => {
  const run = setup();
  const portal = { ...from, fadeOnLastSegment: true, path: [{ x: 100, y: 80 }, { x: 50, y: 50 }, { x: 120, y: 50 }] };
  run.character.place({ x: 100, y: 80 });
  run.transition.restore({ from: portal, to, phase: 'exit', elapsedMs: 0, waypoint: 1 });
  assert.equal(run.transition.characterOpacity, 1, 'approaching the sill is fully visible even beyond its plane');
  run.transition.restore({ from, to: portal, phase: 'entry', elapsedMs: 0, waypoint: 2 });
  assert.equal(run.transition.characterOpacity, 1, 'already inside the room is fully visible');
});
