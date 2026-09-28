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
