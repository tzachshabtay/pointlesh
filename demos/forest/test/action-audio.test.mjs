import { animationDuration, animationTagTime, crossedAnimationTag, crossedAnimationFrameTag } from '@pointlesh/phaser/animation-tags';
import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { CharacterController } from '@pointlesh/core';
const { cinematicAudioCue } = await tsImport('../src/action-audio.ts', import.meta.url);
const { PICKAXE_START_MS } = await tsImport('../src/rescue-assets.ts', import.meta.url);
const { RoomTransitionController } = await tsImport('../src/room-transition.ts', import.meta.url);
const { GuardPatrol } = await tsImport('../src/guard-patrol.ts', import.meta.url);
const { CampStealth } = await tsImport('../src/camp-stealth.ts', import.meta.url);

const clip = (tag, index, count = 8) => ({ key: tag, frames: Array.from({ length: count }, (_, i) => i), frameRate: 10, frameTimings: Array.from({ length: count }, (_, i) => ({ tag: i === index ? tag : undefined })) });

test('cage and lock effects cross the actual animation beats once; seeks stay silent', () => {
  const clips = { cageClose: clip('shut', 7), pickaxe: clip('strike', 3) };
  for (const [kind, step, at, expected] of [['intro', 2, 8475, 'cage-close'], ['ending', 0, PICKAXE_START_MS + 300, 'lock-break']]) {
    assert.equal(cinematicAudioCue(kind, step, step, at - 20, at + 20, 10000, clips), expected);
    assert.equal(cinematicAudioCue(kind, step, step, at + 20, at + 40, 10000, clips), undefined);
    assert.equal(cinematicAudioCue(kind, step, step, 0, at + 20, 10000, clips), undefined, 'restore/seek skips old events');
    assert.equal(cinematicAudioCue(kind, step, step + 1, at - 20, at + 20, 10000, clips), undefined);
  }
});

test('Orrin slurps once at the mug-to-mouth pose in each idle cycle', () => {
  const cues = [];
  let previous = 1;
  for (let i = 2; i <= 48; i++) {
    const frame = (i - 1) % 16 + 1;
    if (crossedAnimationFrameTag(clip('slurp', 6, 16), 'slurp', previous, frame)) cues.push(frame);
    previous = frame;
  }
  assert.deepEqual(cues, [7, 7, 7]);
  assert.equal(crossedAnimationFrameTag(clip('other', 1, 2), 'slurp', 1, 2), false, 'old still-idle clips have no drinking pose');
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
  const playback = { animationDurationMs: 100, get animation() { return clip(patrol.phase === 'drink' ? 'slurp' : 'fall', 0, 1); }, sync() {}, update: delta => character.tick(delta) };
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
  const stealth = new CampStealth(character, { poison: () => { events.push('poison'); return 'done'; }, returned() {}, onPour: () => events.push('pour'), pourDurationMs: () => 1000, pourCueMs: () => 300 });
  const position = character.state.position;
  const checkpoint = { phase: 'pour', elapsedMs: 0, cover: position, clearance: position, path: [position], waypoint: 0 };
  stealth.restore(checkpoint); stealth.update(299); assert.deepEqual(events, []);
  stealth.update(1); assert.deepEqual(events, ['pour']);
  stealth.restore(stealth.snapshot()); stealth.update(700); assert.deepEqual(events, ['pour', 'poison']);
});

test('moving tags and editing frame holds changes timing; removing a tag silences it', () => {
  const animation = clip('shut', 7); animation.frames.reverse();
  animation.frameTimings[0].delayMs = 450;
  assert.equal(animationTagTime(animation, 'shut'), 1050);
  assert.equal(animationDuration(animation), 1150);
  assert.equal(crossedAnimationTag(animation, 'shut', 1040, 1060), true);
  assert.equal(crossedAnimationTag(animation, 'shut', 1060, 1080), false);
  delete animation.frameTimings[7].tag; animation.frameTimings[3].tag = 'shut';
  assert.equal(animationTagTime(animation, 'shut'), 650);
  delete animation.frameTimings[3].tag;
  assert.equal(crossedAnimationTag(animation, 'shut', 0, 2000), false);
});

test('door progress includes the final closing interval before transition completion', () => {
  const character = actor(), cues = [], closing = clip('shut', 7);
  closing.frameTimings = closing.frames.map((_, i) => ({ delayMs: i === 7 ? 1 : 100, tag: i === 7 ? 'shut' : undefined }));
  const portal = { roomId: 'house', areaId: 'out', path: [{ x: 20, y: 50 }, { x: 80, y: 50 }], doorId: 'door', doorDurationMs: 100, doorCloseDurationMs: 75 };
  const transition = new RoomTransitionController(character, { enterRoom() {}, onDoorProgress(action, _portal, before, after) {
    if (action === 'close' && crossedAnimationTag(closing, 'shut', (1-before)*701, (1-after)*701)) cues.push('shut');
  } });
  transition.arrive(portal, portal);
  for(let i=0;i<200&&transition.active;i++){ character.tick(25); transition.update(25); }
  assert.deepEqual(cues, ['shut']);
});


test('cage close is a separately editable reverse clip in Doors; seed tags preserve edits', async () => {
  const { addRescueAssets } = await tsImport('../src/rescue-assets.ts', import.meta.url);
  const { seedAudioFrameTags } = await tsImport('../src/audio-frame-tags.ts', import.meta.url);
  const manifest = { assets: {}, assetPaths: {} };
  addRescueAssets(manifest); seedAudioFrameTags(manifest);
  const open = manifest.assets['cage-door.open'].animations[0];
  const close = manifest.assets['cage-door.close'].animations[0];
  assert.deepEqual(close.frames, [...open.frames].reverse());
  assert.deepEqual(close.frameTimings.map(t => t.delayMs), [...open.frameTimings].reverse().map(t => t.delayMs));
  assert.equal(manifest.assets['cage-door'].linkedAnimationAssets.close.assetId, 'cage-door.close');
  assert.deepEqual(manifest.assetPaths['cage-door'], ['Graphics', 'Objects', 'Doors']);
  assert.equal(close.frameTimings.at(-1).tag, 'shut');
  delete close.frameTimings.at(-1).tag; close.frameTimings[2].tag = 'shut';
  addRescueAssets(manifest); seedAudioFrameTags(manifest);
  assert.equal(close.frameTimings[2].tag, 'shut');
  assert.equal(close.frameTimings.filter(t => t.tag === 'shut').length, 1);
  assert.equal(open.frameTimings.some(t => t.tag === 'shut'), false);
});
