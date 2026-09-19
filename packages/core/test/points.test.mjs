import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayer, createScene, defineSceneManifest } from '@scene-designer/core';
import { createPointPrefab, createObjectPrefab, createPointleshArea, createPointleshInstance, resolvePointleshScene, resolvePointleshPoint, resolvePointleshWalkPoint, approachPointleshEntity, actOnPoint, CharacterController, migratePointleshSceneAreas } from '../dist/index.js';

const floor = [[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }]];
function fixture() {
  const point = createPointPrefab({ x: 60, y: 70, properties: { purpose: 'entry' } });
  const object = createObjectPrefab({ assetId: 'rope', x: 130, y: 70, walkPointId: 'standing' });
  const layer = { ...createLayer({ id: 'main' }), prefabs: [
    createPointleshInstance({ id: 'standing', prefabId: point.id, name: 'By the rope', overrides: { x: { value: 110 } } }),
    createPointleshInstance({ id: 'rope', prefabId: object.id }),
  ], areas: [createPointleshArea({ id: 'door', kind: 'hotspot', walkPointId: 'standing', closed: true, vertices: floor[0] })] };
  const manifest = defineSceneManifest({ schemaVersion: 2, prefabs: { [point.id]: point, [object.id]: object }, scenes: {
    room: { ...createScene({ id: 'room' }), layers: [layer] }, other: createScene({ id: 'other' }),
  } });
  const actor = new CharacterController({ id: 'hero', position: { x: 10, y: 70 }, speed: 100, movementLinkedToAnimation: false });
  actor.setNavigationSource(() => ({ walkables: floor }));
  return { manifest, actor, room: () => resolvePointleshScene(manifest, 'room') };
}

test('point prefabs preserve coordinate inheritance, names and extensions without sprites or polygons', () => {
  const { manifest, room } = fixture();
  assert.equal(room().points.length, 1); assert.equal(room().objects.length, 1); assert.equal(room().areas.length, 1);
  assert.deepEqual(room().points[0].position, { x: 110, y: 70 });
  manifest.prefabs['pointlesh.point'].attributes.find(attribute => attribute.id === 'y').number.value = 80;
  assert.deepEqual(room().points[0].position, { x: 110, y: 80 });
  manifest.scenes.room.layers[0].prefabs[0].name = 'Renamed';
  assert.equal(resolvePointleshPoint(room(), 'standing').name, 'Renamed');
  assert.deepEqual(resolvePointleshWalkPoint(room(), room().objects[0]), { x: 110, y: 80 });
  assert.deepEqual(resolvePointleshScene(JSON.parse(JSON.stringify(manifest)), 'room'), room());
  assert.deepEqual(migratePointleshSceneAreas(manifest), manifest);
});

test('move is immediate, walk animates along navigation and explicit unreachable points never snap', async () => {
  const { room, actor } = fixture(), point = room().points[0];
  const walking = actOnPoint(actor, point, 'walk');
  assert.equal(actor.state.activity, 'walking'); assert.deepEqual(actor.state.position, { x: 10, y: 70 });
  actor.tick(500); assert.deepEqual(actor.state.position, { x: 60, y: 70 });
  actor.tick(500); assert.equal(await walking, true); assert.deepEqual(actor.state.position, point.position);
  const outside = { ...point, position: { x: 400, y: 70 } };
  assert.equal(await actOnPoint(actor, outside, 'walk'), false);
  assert.deepEqual(actor.state.position, point.position);
  assert.equal(await actOnPoint(actor, outside, 'move'), true);
  assert.deepEqual(actor.state.position, outside.position);
});

test('objects and hotspots reach named walk points before dispatch; interruption and broken references prevent it', async () => {
  const { manifest, actor, room } = fixture();
  let interactions = 0;
  for (const target of [room().objects[0], room().areas[0]]) {
    actor.place({ x: 10, y: 70 });
    const pending = approachPointleshEntity(actor, room(), target).then(arrived => { if (arrived) interactions++; });
    const before = interactions;
    actor.tick(500); await Promise.resolve(); assert.equal(interactions, before);
    actor.tick(500); await pending; assert.equal(interactions, before + 1);
    assert.deepEqual(actor.state.position, { x: 110, y: 70 });
  }
  actor.place({ x: 10, y: 70 });
  const interrupted = approachPointleshEntity(actor, room(), room().objects[0]); actor.stop();
  assert.equal(await interrupted, false);
  assert.throws(() => resolvePointleshPoint(resolvePointleshScene(manifest, 'other'), 'standing'), /missing or disabled/);
  manifest.scenes.room.layers[0].prefabs[0].visible = false;
  assert.throws(() => approachPointleshEntity(actor, room(), room().objects[0]), /missing or disabled/);
});
