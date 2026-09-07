import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneSceneManifest, createLayer, defineSceneManifest } from '@scene-designer/core';
import {
  createCharacterPrefab, createHotspotPrefab, createPointleshInstance,
  createWalkableAreaPrefab, createAreaPrefab, extendPointleshPrefab, pointleshAreaPolygon, pointleshAreaCapabilities, pointleshPrefabs,
  resolvePointleshScene, walkablePolygons,
} from '../dist/prefabs.js';

const square = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 100, y: 100 }, { id: 'd', x: 0, y: 100 }];
function manifestFor(prefabs, instances) {
  const layer = createLayer({ id: 'main' });
  layer.prefabs = instances;
  return defineSceneManifest({ schemaVersion: 2, prefabs: Object.fromEntries(prefabs.map(prefab => [prefab.id, prefab])), scenes: { room: { id: 'room', name: 'Room', width: 320, height: 180, layers: [layer] } } });
}

test('native partial overrides retain live defaults and Pointlesh metadata through clone/export', () => {
  const prefab = createCharacterPrefab({ assetId: 'dwarf', properties: { quest: { phase: 1 } }, behaviors: ['greet'] });
  const instance = createPointleshInstance({ id: 'hero', prefabId: prefab.id, properties: { title: 'miner' }, behaviors: ['greet', 'mine'], overrides: { object: { x: 30 }, speed: { value: 90 } } });
  const manifest = manifestFor([prefab], [instance]);
  prefab.attributes.find(attribute => attribute.id === 'object').object.y = 80;
  const cloned = cloneSceneManifest(JSON.parse(JSON.stringify(manifest)));
  const object = resolvePointleshScene(cloned, 'room').objects[0];
  assert.deepEqual(object.position, { x: 30, y: 80 });
  assert.equal(object.properties.speed, 90);
  assert.equal(object.properties.title, 'miner');
  assert.deepEqual(object.properties.quest, { phase: 1 });
  assert.deepEqual(object.behaviors, ['greet', 'mine']);
  assert.equal(object.id, 'hero');
  assert.equal(object.objectId, 'hero::object');
  assert.equal(object.anchorY, 0, 'Native anchorY=0 places the sprite origin at its feet');
});

test('derived prefabs merge extension data without mutating the source', () => {
  const base = createHotspotPrefab({ properties: { locked: true }, behaviors: ['inspect'] });
  const derived = extendPointleshPrefab(base, { id: 'locked-door', properties: { key: 'gold-key' }, behaviors: ['unlock'], propertySchema: { key: { type: 'string' } } });
  derived.pointlesh.properties.locked = false;
  assert.equal(base.pointlesh.properties.locked, true);
  assert.equal(derived.pointlesh.properties.key, 'gold-key');
  assert.deepEqual(derived.pointlesh.behaviors, ['inspect', 'unlock']);
  assert.equal(derived.attributes.length, base.attributes.length);
  assert.equal(derived.pointlesh.propertySchema.key.type, 'string');
});

test('only closed enabled walkable shapes enter navigation and visibility resolves at every level', () => {
  const prefab = createWalkableAreaPrefab({ vertices: square });
  const instances = [
    createPointleshInstance({ id: 'floor', prefabId: prefab.id }),
    createPointleshInstance({ id: 'disabled', prefabId: prefab.id, properties: { enabled: false } }),
    createPointleshInstance({ id: 'open', prefabId: prefab.id, overrides: { area: { closed: false } } }),
    createPointleshInstance({ id: 'hidden', prefabId: prefab.id, visible: false }),
    createPointleshInstance({ id: 'nonwalkable', prefabId: prefab.id, properties: { walkable: false } }),
  ];
  const manifest = manifestFor([prefab], instances);
  assert.equal(walkablePolygons(resolvePointleshScene(manifest, 'room')).length, 1);
  manifest.scenes.room.layers[0].visible = false;
  assert.equal(walkablePolygons(resolvePointleshScene(manifest, 'room')).length, 0);
});

test('quadratic area curves are converted to runtime geometry rather than straight edges', () => {
  const polygon = pointleshAreaPolygon([{ id: 'a', x: 0, y: 0, curve: { cx: 50, cy: -50 } }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 50, y: 100 }], true, 4);
  assert.equal(polygon.length, 6);
  assert.deepEqual(polygon[2], { x: 50, y: -25 });
  assert.throws(() => pointleshAreaPolygon(square, true, 0), /positive integer/);
});

test('one native region combines independent roles and inherits later prefab edits', () => {
  const prefab = createAreaPrefab({ vertices: square, walkable: true, scaleEnabled: true, zoomEnabled: true, minScale: 0.5, properties: { footsteps: 'leaves' } });
  const instance = createPointleshInstance({ id: 'ground', prefabId: prefab.id, properties: { zoomEnabled: false }, overrides: { maxScale: { value: 1.5 } } });
  const manifest = manifestFor([prefab], [instance]);
  const resolve = () => resolvePointleshScene(cloneSceneManifest(JSON.parse(JSON.stringify(manifest))), 'room');
  const room = resolve();
  assert.equal(room.areas.length, 1);
  assert.equal(room.areas[0].kind, 'area');
  assert.deepEqual(pointleshAreaCapabilities(room.areas[0]), { walkable: true, scale: true, zoom: false, walkBehind: false });
  assert.equal(walkablePolygons(room).length, 1);
  assert.equal(room.areas[0].properties.maxScale, 1.5);
  assert.equal(room.areas[0].properties.footsteps, 'leaves');
  prefab.pointlesh.properties.walkBehindEnabled = true;
  prefab.pointlesh.properties.walkable = false;
  assert.deepEqual(pointleshAreaCapabilities(resolve().areas[0]), { walkable: false, scale: true, zoom: false, walkBehind: true });
  assert.equal(walkablePolygons(resolve()).length, 0);
  assert.deepEqual(resolve().areas[0].polygon, room.areas[0].polygon);
});

test('new area catalog has one region template while legacy factories and manifests remain available', () => {
  assert.deepEqual(Object.keys(pointleshPrefabs()), ['pointlesh.area', 'pointlesh.hotspot', 'pointlesh.object', 'pointlesh.character']);
  const legacy = pointleshPrefabs({ includeLegacyAreas: true });
  for (const [kind, role] of [['walkable', 'walkable'], ['scale', 'scale'], ['zoom', 'zoom'], ['walk-behind', 'walkBehind']]) {
    const prefab = legacy[`pointlesh.${kind}`];
    assert.equal(pointleshAreaCapabilities(prefab.pointlesh)[role], true);
  }
  assert.deepEqual(pointleshAreaCapabilities(createAreaPrefab().pointlesh), { walkable: false, scale: false, zoom: false, walkBehind: false });
});
