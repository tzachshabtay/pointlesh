import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { CharacterController } from '@pointlesh/core';
const { cinematicAudioCue, minerSipCue } = await tsImport('../src/action-audio.ts', import.meta.url);
const { PICKAXE_START_MS, PICKAXE_IMPACT_MS } = await tsImport('../src/rescue-assets.ts', import.meta.url);
const { RoomTransitionController } = await tsImport('../src/room-transition.ts', import.meta.url);
const { GuardPatrol } = await tsImport('../src/guard-patrol.ts', import.meta.url);
const { CampStealth } = await tsImport('../src/camp-stealth.ts', import.meta.url);

test('cage and lock effects cross the actual animation beats once; seeks stay silent', () => {
  for (const [kind, step, at, expected] of [['intro', 2, 6900, 'cage-close'], ['ending', 0, PICKAXE_START_MS + PICKAXE_IMPACT_MS, 'lock-break']]) {
    assert.equal(cinematicAudioCue(kind, step, step, at - 20, at + 20, 10000), expected);
    assert.equal(cinematicAudioCue(kind, step, step, at + 20, at + 40, 10000), undefined);
    assert.equal(cinematicAudioCue(kind, step, step, 0, at + 20, 10000), undefined, 'restore/seek skips old events');
    assert.equal(cinematicAudioCue(kind, step, step + 1, at - 20, at + 20, 10000), undefined);
  }
});

test('Orrin slurps once at the mug-to-mouth pose in each idle cycle', () => {
  const cues = [];
  let previous = 1;
  for (let i = 2; i <= 48; i++) {
    const frame = (i - 1) % 16 + 1;
    if (minerSipCue(previous, frame, 16)) cues.push(frame);
    previous = frame;
  }
  assert.deepEqual(cues, [7, 7, 7]);
  assert.equal(minerSipCue(1, 2, 2), false, 'old still-idle clips have no drinking pose');
});

const ground = [{ x: -100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: -100, y: 100 }];
function actor(id = 'borin') {
  const character = new CharacterController({ id, position: { x: 20, y: 50 }, speed: 100, movementLinkedToAnimation: false });
  character.setNavigationSource(() => ({ walkables: [ground] })); return character;
}
test('a doorway plays one opening and one closure, without replaying on restore', () => {
  const character = actor(), events = [];
  const from = { roomId: 'house', areaId: 'out', path: [{ x: 20, y: 50 }, { x: 80, y: 50 }], doorId: 'inside', doorDurationMs: 100 };
  const to = { roomId: 'village', areaId: 'in', path: [{ x: 40, y: 50 }, { x: -30, y: 50 }], doorId: 'outside', doorDurationMs: 100 };
  const transition = new RoomTransitionController(character, { enterRoom() {}, onDoor: (action, portal) => events.push(`${action}:${portal.doorId}`) });
  transition.begin(from, to);
  for (let i = 0; i < 1000 && transition.active; i++) {
    transition.restore(transition.snapshot());
    character.tick(10); transition.update(10);
  }
  assert.deepEqual(events, ['open:inside', 'close:outside']);
  events.length = 0;
  transition.arrive(from, to);
  for (let i = 0; i < 1000 && transition.active; i++) { character.tick(10); transition.update(10); }
  assert.deepEqual(events, ['open:outside', 'close:outside']);
});

test('guard slurps and lands once per action, including restore during an action', () => {
  const character = actor('camp.npc.guard'), events = [];
  const playback = { animationDurationMs: 100, sync() {}, update: delta => character.tick(delta) };
  const patrol = new GuardPatrol(character, playback, () => ({ home: { x: 20, y: 50 }, drink: { x: 80, y: 50 } }), () => true, () => {}, () => false, cue => events.push(cue));
  patrol.start();
  for (let i = 0; i < 100 && patrol.phase !== 'asleep'; i++) {
    patrol.restore(patrol.snapshot()); patrol.update(20);
  }
  assert.deepEqual(events, ['guard-slurp', 'guard-fall']);
  patrol.update(10000); assert.equal(events.length, 2);
});

test('the pour effect starts at the pour pose, never on departure or a rejected attempt', () => {
  const character = actor(), events = [];
  const stealth = new CampStealth(character, { poison: () => { events.push('poison'); return 'done'; }, returned() {}, onPour: () => events.push('pour'), pourDurationMs: () => 1000 });
  const position = character.state.position;
  const checkpoint = { phase: 'pour', elapsedMs: 0, cover: position, clearance: position, path: [position], waypoint: 0 };
  stealth.restore(checkpoint); stealth.update(299); assert.deepEqual(events, []);
  stealth.update(1); assert.deepEqual(events, ['pour']);
  stealth.restore(stealth.snapshot()); stealth.update(700); assert.deepEqual(events, ['pour', 'poison']);
});
