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

test('opens once, walks out and in without a second opening, then closes on arrival', () => {
  const run = setup(); run.transition.begin(from, to);
  const phases = new Set();
  for (let i = 0; i < 1000 && run.transition.active; i++) {
    phases.add(run.transition.phase);
    if (!run.events.length) assert.equal(run.transition.portal.roomId, 'a');
    run.tick();
  }
  assert.deepEqual([...phases], ['open-exit', 'exit', 'entry', 'close-entry']);
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
  assert.equal(restoredPhases.size, 4);
});

test('doorway handoff switches at the sill and immediately continues walking with the destination open', () => {
  const run = setup(), outgoing = { ...from, handoffIndex: 1 }, incoming = { ...to, handoffIndex: 1 };
  let exitPosition, doorAtSwitch;
  const enterRoom = run.transition.options.enterRoom;
  run.transition.options.enterRoom = portal => {
    exitPosition = { ...run.character.state.position };
    doorAtSwitch = run.transition.doorProgress;
    enterRoom(portal);
  };
  run.transition.begin(outgoing, incoming);
  for (let i = 0; i < 500 && !run.events.length; i++) run.tick();
  assert.deepEqual(exitPosition, outgoing.path[1], 'do not repeat the concealed tail of the exit');
  assert.deepEqual(run.character.state.position, incoming.path[1], 'appear midway through the doorway');
  assert.equal(doorAtSwitch, 1);
  assert.equal(run.transition.doorProgress, 1);
  assert.equal(run.transition.phase, 'entry');
  assert.equal(run.character.isWalking, true, 'first destination frame is already walking');
  assert.deepEqual(run.character.destination, incoming.path[0]);
  assert.equal(run.transition.snapshot().waypoint, 1);
  const copy = setup(); copy.character.restore(run.character.snapshot()); copy.transition.restore(run.transition.snapshot());
  assert.equal(copy.character.isWalking, true); assert.equal(copy.transition.doorProgress, 1);
  run.tick();
  assert.ok(run.character.state.position.x > incoming.path[1].x, 'no stationary opening wait after the cut');
  for (let i = 0; i < 1000 && copy.transition.active; i++) copy.tick();
  assert.deepEqual(copy.events, ['done']);
  assert.deepEqual(copy.character.state.position, incoming.path[0]);
});

test('handoff indices must select a real crossing point and saved waypoints stay within the shortened route', () => {
  for (const handoffIndex of [-1, 0, 3, .5, NaN, Infinity]) {
    assert.throws(() => setup().transition.begin({ ...from, handoffIndex }, to), /Invalid room portal/);
  }
  assert.throws(() => assertRoomTransitionCheckpoint({ from: { ...from, handoffIndex: 1 }, to, phase: 'exit', elapsedMs: 0, waypoint: 2 }), /Invalid transition waypoint/);
});

test('old close-exit and open-entry checkpoints skip the redundant door cycle', () => {
  for (const phase of ['close-exit', 'open-entry']) {
    const run = setup();
    run.character.place(phase === 'close-exit' ? from.path.at(-1) : to.path.at(-1));
    run.transition.restore({ from, to, phase, elapsedMs: 25, waypoint: 0 });
    run.transition.update(0);
    assert.equal(run.transition.phase, 'entry');
    assert.equal(run.transition.doorProgress, 1);
    assert.deepEqual(run.events, phase === 'close-exit' ? ['b'] : []);
    for (let i = 0; i < 1000 && run.transition.active; i++) run.tick();
    assert.deepEqual(run.character.state.position, to.path[0]);
    assert.deepEqual(run.events, phase === 'close-exit' ? ['b', 'done'] : ['done']);
  }
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

test('legacy saves with doorway fading still resume their route without a rendering dependency', () => {
  const run = setup();
  const legacyFrom = { ...from, fadeOnLastSegment: true }, legacyTo = { ...to, fadeOnLastSegment: true };
  const checkpoint = { from: legacyFrom, to: legacyTo, phase: 'exit', elapsedMs: 0, waypoint: 1 };
  assertRoomTransitionCheckpoint(checkpoint);
  run.character.place(from.path[1]);
  run.transition.restore(checkpoint);
  for (let i = 0; i < 1000 && run.transition.active; i++) run.tick();
  assert.deepEqual(run.events, ['b', 'done']);
  assert.deepEqual(run.character.state.position, to.path[0]);
  assert.equal(run.transition.active, false);
});
