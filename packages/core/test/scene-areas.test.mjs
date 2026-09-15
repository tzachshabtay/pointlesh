import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayer, createScene, defineSceneManifest } from '@scene-designer/core';
import { createPointleshArea, createAreaPrefab, createPointleshInstance, migratePointleshSceneAreas, resolvePointleshScene, walkablePolygons } from '../dist/index.js';

test('scene polygons resolve without prefabs and persist capabilities, geometry and extensions', () => {
  const area = createPointleshArea({ id: 'floor', name: 'Ground', walkable: true, scaleEnabled: true, baseline: 320,
    closed: true, vertices: [{ x: 0, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }], properties: { terrain: { footsteps: 'leaves' } }, behaviors: ['footsteps'] });
  const scene = { ...createScene({ id: 'room' }), layers: [{ ...createLayer({ id: 'main' }), areas: [area] }] };
  const manifest = defineSceneManifest({ schemaVersion: 2, scenes: { room: scene } });
  const resolved = resolvePointleshScene(JSON.parse(JSON.stringify(manifest)), 'room');
  assert.equal(resolved.areas[0].prefabId, undefined);
  assert.equal(resolved.areas[0].instanceId, undefined);
  assert.equal(resolved.areas[0].id, 'floor');
  assert.equal(resolved.areas[0].properties.baseline, 320);
  assert.deepEqual(resolved.areas[0].properties.terrain, { footsteps: 'leaves' });
  assert.equal(walkablePolygons(resolved).length, 1);
  area.visible = false;
  assert.equal(walkablePolygons(resolvePointleshScene(manifest, 'room')).length, 0);
});

test('migration detaches each shared area, preserving IDs, overrides, locks and native shapes', () => {
  const prefab = createAreaPrefab({ id: 'shared', baseline: 200, walkBehindEnabled: true, propertySchema: { baseline: { type: 'number', description: 'Ground depth' } },
    vertices: [{ x: 0, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 400 }] });
  const manifest = defineSceneManifest({ schemaVersion: 2, prefabs: { shared: prefab }, scenes: Object.fromEntries(['one', 'two'].map((id, index) => [id,
    { ...createScene({ id }), layers: [{ ...createLayer({ id: 'main' }), prefabs: [createPointleshInstance({ id: `${id}.foreground`, prefabId: 'shared', locked: index === 1, overrides: { baseline: { value: 300 + index } } })] }] }])) });
  const original = structuredClone(manifest), migrated = migratePointleshSceneAreas(manifest);
  assert.deepEqual(manifest, original);
  assert.deepEqual(migrated.prefabs, {});
  for (const [index, id] of ['one', 'two'].entries()) {
    const layer = migrated.scenes[id].layers[0], area = layer.areas[0];
    assert.deepEqual(layer.prefabs, []);
    assert.equal(area.id, `${id}.foreground::area`);
    assert.equal(area.pointlesh.entityId, `${id}.foreground`);
    assert.equal(area.pointlesh.properties.baseline, 300 + index);
    assert.equal(area.pointlesh.propertySchema.baseline.description, 'Ground depth');
    assert.equal(area.locked, index === 1);
  }
  migrated.scenes.one.layers[0].areas[0].vertices[0].x = 99;
  assert.equal(migrated.scenes.two.layers[0].areas[0].vertices[0].x, 0);
  assert.deepEqual(migratePointleshSceneAreas(migrated), migrated);
});
