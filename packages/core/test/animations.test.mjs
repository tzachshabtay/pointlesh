import assert from 'node:assert/strict';
import test from 'node:test';
import { createLayer, defineSceneManifest } from '@scene-designer/core';
import { assertCharacterAnimations, CharacterController, createCharacterPrefab, createPointleshInstance, extendPointleshPrefab, mergeCharacterAnimations, readCharacterAnimations, resolveCharacterAnimation, resolvePointleshScene } from '../dist/index.js';

const assignment = (key, flipX = false) => ({ assetId: 'character.dwarf', key, flipX });
const floor = [[{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }]];

test('directional assignments resolve real states, optional diagonals and speaking fallback without implicit flipping', () => {
  const map = { idle: { front: assignment('idle-front'), left: assignment('idle-left') }, walk: { front: assignment('walk-front'), right: assignment('walk-left', true), 'back-right': assignment('walk-diagonal') } };
  assert.equal(resolveCharacterAnimation(map, 'walking', 'down-left').key, 'walk-front');
  assert.equal(resolveCharacterAnimation(map, 'walking', 'up-right').key, 'walk-diagonal');
  assert.equal(resolveCharacterAnimation(map, 'walking', 'right').flipX, true);
  assert.equal(resolveCharacterAnimation(map, 'speaking', 'left').key, 'idle-left');
  assert.equal(resolveCharacterAnimation(map, 'idle', 'up'), undefined);
  const resolved = resolveCharacterAnimation(map, 'idle', 'down'); resolved.key = 'changed';
  assert.equal(map.idle.front.key, 'idle-front');
});

test('character prefab and instance animation overrides inherit each untouched slot after later prefab edits', () => {
  const base = createCharacterPrefab({ animations: { idle: { front: assignment('idle') }, walk: { left: assignment('left'), right: assignment('left', true) } }, directions: 8 });
  const derived = extendPointleshPrefab(base, { id: 'ranger', properties: { animations: { walk: { right: assignment('right') } } } });
  assert.equal(derived.pointlesh.properties.animations.walk.left.key, 'left');
  assert.equal(base.pointlesh.properties.animations.walk.right.flipX, true);
  const layer = createLayer({ id: 'main' });
  const instance = createPointleshInstance({ id: 'borin', prefabId: base.id, properties: { animations: { walk: { right: assignment('special') } } } });
  layer.prefabs = [instance];
  const manifest = defineSceneManifest({ schemaVersion: 2, prefabs: { [base.id]: base }, scenes: { room: { id: 'room', name: 'Room', width: 320, height: 180, layers: [layer] } } });
  base.pointlesh.properties.animations.walk.left.key = 'new-left';
  const properties = resolvePointleshScene(manifest, 'room').objects[0].properties;
  assert.equal(properties.animations.walk.left.key, 'new-left');
  assert.equal(properties.animations.walk.right.key, 'special');
  assert.equal(properties.directions, 8);
  delete instance.pointlesh.properties.animations.walk.right;
  assert.equal(resolvePointleshScene(manifest, 'room').objects[0].properties.animations.walk.right.flipX, true);
  const read = readCharacterAnimations(properties); read.idle.front.key = 'edited';
  assert.equal(properties.animations.idle.front.key, 'idle');
});

test('invalid animation data fails before prefab construction and sparse merges detach their source', () => {
  for (const value of [null, [], { run: {} }, { idle: { down: assignment('idle') } }, { walk: { front: { assetId: 'x', key: '', flipX: false } } }, { speak: { front: { ...assignment('speak'), flipX: 'true' } } }]) assert.throws(() => assertCharacterAnimations(value));
  assert.throws(() => createCharacterPrefab({ animations: { idle: { front: { assetId: '', key: 'idle' } } } }));
  const base = { walk: { left: assignment('left', true) } };
  const merged = mergeCharacterAnimations(base, { walk: { left: { assetId: 'new', key: 'left' } } });
  assert.equal(merged.walk.left.flipX, undefined, 'Assignments are atomic; stale flip is not inherited');
  merged.walk.left.assetId = 'changed'; assert.equal(base.walk.left.assetId, 'character.dwarf');
});

test('authored variable delays advance planted-foot distance and idle cycles independently of tick partition', () => {
  const make = () => { const actor = new CharacterController({ id: 'actor', position: { x: 100, y: 100 }, walkStep: 10 }); actor.setAnimationTiming([50, 150, 100]); return actor; };
  const actor = make(); actor.tick(50);
  assert.equal(actor.state.animationFrame, 1); assert.deepEqual(actor.state.position, { x: 100, y: 100 });
  actor.walkTo({ x: 1000, y: 100 }, floor); actor.tick(49); assert.equal(actor.state.position.x, 100);
  actor.tick(1); assert.equal(actor.state.position.x, 110); actor.tick(149); assert.equal(actor.state.position.x, 110);
  actor.tick(1); assert.equal(actor.state.position.x, 120);
  const whole = make(), partitioned = make(); whole.walkTo({ x: 9000, y: 100 }, floor); partitioned.walkTo({ x: 9000, y: 100 }, floor);
  whole.tick(3275); for (const dt of [49, 1, 150, 1075, 2000]) partitioned.tick(dt);
  assert.deepEqual(partitioned.snapshot(), whole.snapshot());
  whole.say('A warning', 501); partitioned.say('A warning', 501);
  whole.tick(500); partitioned.tick(151); partitioned.tick(349);
  assert.deepEqual(partitioned.snapshot(), whole.snapshot());
  assert.equal(whole.state.speech.remainingMs, 1);
  whole.tick(201); partitioned.tick(1); partitioned.tick(200);
  assert.deepEqual(partitioned.snapshot(), whole.snapshot(), 'Elapsed time after speech completion advances the idle clock consistently');
});

test('restoring a walking checkpoint while showing a shorter idle cycle preserves the saved phase', () => {
  const source = new CharacterController({ id: 'actor', position: { x: 100, y: 100 }, walkStep: 10 });
  source.setAnimationTiming([100, 100, 100, 100, 100, 150]); source.walkTo({ x: 1000, y: 100 }, floor); source.tick(625);
  const checkpoint = source.snapshot(); assert.equal(checkpoint.animationFrame, 5); assert.equal(checkpoint.animationElapsedMs, 125);
  const loaded = new CharacterController({ id: 'actor', position: { x: 100, y: 100 }, walkStep: 10 }); loaded.setAnimationTiming([650, 650]); loaded.restore(checkpoint);
  assert.equal(loaded.state.animationFrame, 5); assert.equal(loaded.state.animationElapsedMs, 125);
  loaded.setAnimationTiming([100, 100, 100, 100, 100, 150]); source.tick(25); loaded.tick(25);
  assert.deepEqual(loaded.snapshot(), source.snapshot());
  const before = loaded.snapshot(); assert.throws(() => loaded.setAnimationTiming([100, 0])); assert.deepEqual(loaded.snapshot(), before);
});
