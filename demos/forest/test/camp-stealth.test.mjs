import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { CharacterController } from '@pointlesh/core';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const { CampStealth } = await tsImport('../src/camp-stealth.ts', import.meta.url);
const { RoomTransitionController } = await tsImport('../src/room-transition.ts', import.meta.url);
const { PEEK_DOOR_OPEN } = await tsImport('../src/stealth-assets.ts', import.meta.url);
const { addStealthAssets, peekAsset, peekIdleAsset } = await tsImport('../src/stealth-assets.ts', import.meta.url);
const ground = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
const cover = { x: 10, y: 20 }, clear = { x: 10, y: 100 }, pot = { x: 140, y: 100 };
function setup() {
  const hero = new CharacterController({ id: 'borin', position: cover, movementLinkedToAnimation: false, speed: 100 });
  hero.setNavigationSource(() => ({ walkables: [ground] }));
  const events = [];
  const stealth = new CampStealth(hero, { poison: () => { events.push('poison'); return 'done'; }, returned: message => events.push(message ?? 'free') });
  return { hero, stealth, events, tick: () => { hero.tick(20); stealth.update(20); } };
}
test('the poison trip walks via the clear floor, applies only at the pot, and returns to cover', () => {
  const run = setup(); run.stealth.start(cover); run.stealth.poison(pot, clear);
  const restored = new Set();
  for (let i = 0; i < 1000 && run.stealth.busy; i++) {
    const state = run.stealth.snapshot(), key = `${state.phase}/${state.waypoint}`;
    if (!restored.has(key)) {
      const copy = setup(); copy.hero.restore(run.hero.snapshot()); copy.stealth.restore(state);
      for (let j = 0; j < 1000 && copy.stealth.busy; j++) copy.tick();
      assert.deepEqual(copy.hero.state.position, cover);
      assert.equal(copy.events.filter(event => event === 'poison').length, ['outbound', 'pour'].includes(state.phase) ? 1 : 0);
      restored.add(key);
    }
    run.tick();
    if (run.events.includes('poison')) assert.equal(run.stealth.snapshot().phase === 'outbound', false);
  }
  assert.deepEqual(run.events, ['poison', 'done']); assert.deepEqual(run.hero.state.position, cover);
  assert.equal(run.stealth.peeking, true); assert.equal(restored.size, 5);
  run.stealth.release(clear);
  for (let i = 0; i < 1000 && run.stealth.busy; i++) run.tick();
  assert.deepEqual(run.hero.state.position, clear); assert.equal(run.stealth.snapshot(), null);
});
test('an interrupted approach cannot poison the pot from a distance', () => {
  const run = setup(); run.stealth.start(cover); run.stealth.poison(pot, clear);
  run.hero.stop(); run.stealth.update(20);
  assert.deepEqual(run.events, []); assert.equal(run.stealth.snapshot().phase, 'return');
});
test('check the guard before the pour starts; finish a accepted pour once even after he turns', () => {
  const hero = new CharacterController({ id: 'borin', position: pot, movementLinkedToAnimation: false });
  let watching = false, calls = 0;
  const stealth = new CampStealth(hero, { canPour: () => !watching, poison: () => { calls++; return 'done'; }, returned: () => {} });
  const checkpoint = { phase: 'outbound', elapsedMs: 0, cover, clearance: clear, path: [pot], waypoint: 0 };
  stealth.restore(checkpoint); stealth.update(0); assert.equal(stealth.pouring, true);
  watching = true; stealth.update(800); assert.equal(calls, 0);
  const saved=stealth.snapshot(); stealth.restore(saved); stealth.update(1000); assert.equal(calls, 1);
  stealth.update(1000); assert.equal(calls, 1);
  stealth.restore(checkpoint); stealth.update(0); assert.equal(stealth.pouring, false); assert.equal(calls, 1);
});
test('the peeking idle clock starts at zero and survives save/load without moving the feet', () => {
  const run = setup(); run.stealth.start(cover);
  assert.equal(run.stealth.elapsedMs, 0);
  run.stealth.update(730);
  const restored = setup(); restored.stealth.restore(run.stealth.snapshot());
  assert.equal(restored.stealth.elapsedMs, 730);
  run.stealth.update(100); restored.stealth.update(100);
  assert.deepEqual(restored.stealth.snapshot(), run.stealth.snapshot());
  assert.deepEqual(run.hero.state.position, cover);
});
test('a stealth entry opens the gate only partly and finishes at its threshold with a peek', () => {
  const run = setup(), from = { roomId: 'forest', areaId: 'forest.gate', path: [cover, clear], doorId: 'outer' };
  const to = { roomId: 'camp', areaId: 'camp.gate', path: [pot, clear], doorId: 'inner' };
  const phases = new Set(); let entries = 0;
  const transition = new RoomTransitionController(run.hero, { enterRoom: () => entries++ });
  transition.begin(from, to, true);
  for (let i = 0; i < 1000 && transition.active; i++) {
    phases.add(transition.phase); assert.ok(transition.doorProgress <= PEEK_DOOR_OPEN);
    run.hero.tick(20); transition.update(20);
    if (transition.phase === 'peek-entry') {
      assert.deepEqual(run.hero.state.position, clear); assert.equal(run.hero.isWalking, false);
      const checkpoint = transition.snapshot(); transition.restore(checkpoint); assert.deepEqual(transition.snapshot(), checkpoint);
    }
  }
  assert.deepEqual([...phases], ['open-exit', 'exit', 'peek-entry']); assert.equal(entries, 1);
  assert.deepEqual(run.hero.state.position, clear);
});
test('leaving cover closes the ajar gate in place, with no camp or forest entrance walk, including after load', () => {
  const from = { roomId: 'camp', areaId: 'camp.gate', path: [pot, clear, cover], doorId: 'inner' };
  const to = { roomId: 'forest', areaId: 'forest.gate', path: [{ x: 180, y: 160 }, { x: 180, y: 40 }], doorId: 'outer' };
  const run = setup(); let entries = 0, completions = 0;
  const transition = new RoomTransitionController(run.hero, {
    enterRoom: portal => { assert.equal(portal.roomId, 'forest'); entries++; }, onComplete: () => completions++,
  });
  transition.begin(from, to, true);
  assert.equal(transition.phase, 'peek-exit'); assert.equal(transition.doorProgress, PEEK_DOOR_OPEN);
  let previousProgress = PEEK_DOOR_OPEN;
  for (let i = 0; i < 100 && transition.active; i++) {
    assert.equal(run.hero.isWalking, false);
    assert.deepEqual(run.hero.state.position, cover);
    assert.equal(transition.closing, true);
    assert.ok(transition.doorProgress <= previousProgress);
    previousProgress = transition.doorProgress;
    // A save at any point resumes the closing phase without adding a walk.
    const copy = setup(); copy.hero.restore(run.hero.snapshot());
    const loaded = new RoomTransitionController(copy.hero, { enterRoom: () => {} });
    loaded.restore(transition.snapshot());
    assert.equal(loaded.doorProgress, transition.doorProgress);
    for (let j = 0; j < 100 && loaded.active; j++) {
      assert.equal(copy.hero.isWalking, false); copy.hero.tick(20); loaded.update(20);
    }
    assert.equal(loaded.active, false); assert.deepEqual(copy.hero.state.position, to.path[0]);
    run.hero.tick(20); transition.update(20);
  }
  assert.equal(transition.active, false); assert.equal(entries, 1); assert.equal(completions, 1);
  assert.equal(transition.doorProgress, 0); assert.equal(run.hero.isWalking, false);
  assert.deepEqual(run.hero.state.position, to.path[0]);
});
test('the peek is an editable linked animation with distinct transparent poses and stable feet', () => {
  const authored = JSON.parse(readFileSync(new URL('../public/authoring/assets.json', import.meta.url)));
  assert.equal(authored.assets.borin.linkedAnimationAssets.peek.assetId, 'borin.peek');
  const png = PNG.sync.read(readFileSync(new URL('../public/' + peekAsset.versions.stealth.file, import.meta.url)));
  assert.deepEqual([png.width, png.height], [640, 280]);
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const frame = new PNG({ width: 160, height: 140 });
    PNG.bitblt(png, frame, i % 4 * 160, Math.floor(i / 4) * 140, 160, 140, 0, 0);
    let bottom = -1;
    for (let y = 0; y < 140; y++) for (let x = 0; x < 160; x++) if (frame.data[(y * 160 + x) * 4 + 3] > 16) bottom = y;
    assert.equal(bottom, 119); assert.equal(frame.data[3], 0);
    frames.push(frame.data.toString('base64'));
  }
  assert.equal(new Set(frames).size, 8);
  authored.assets['borin.peek'].activeVersion = 'custom';
  authored.assets.borin.linkedAnimationAssets.peek.assetId = 'custom-peek';
  const before = structuredClone(authored); addStealthAssets(authored); assert.deepEqual(authored, before);
});
test('the eight-frame idle loop starts at the exact final peek frame and keeps its feet planted', () => {
  const peek = PNG.sync.read(readFileSync(new URL('../public/' + peekAsset.versions.stealth.file, import.meta.url)));
  const idle = PNG.sync.read(readFileSync(new URL('../public/' + peekIdleAsset.versions.stealth.file, import.meta.url)));
  const last = new PNG({ width: 160, height: 140 }), first = new PNG({ width: 160, height: 140 });
  PNG.bitblt(peek, last, 480, 140, 160, 140, 0, 0); PNG.bitblt(idle, first, 0, 0, 160, 140, 0, 0);
  assert.deepEqual(first.data, last.data);
  assert.equal(peekIdleAsset.animations[0].repeat, -1);
  assert.equal(peekIdleAsset.animations[0].frames.length, 8);
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const frame = new PNG({ width: 160, height: 140 });
    PNG.bitblt(idle, frame, i % 4 * 160, Math.floor(i / 4) * 140, 160, 140, 0, 0);
    let bottom = -1;
    for (let y = 0; y < 140; y++) for (let x = 0; x < 160; x++) if (frame.data[(y * 160 + x) * 4 + 3] > 16) bottom = y;
    assert.equal(bottom, 119); assert.equal(frame.data[3], 0); frames.push(frame.data.toString('base64'));
  }
  assert.equal(new Set(frames).size, 8);
});
