import assert from 'node:assert/strict';
import test from 'node:test';
import { createAreaPrefab, createPointleshInstance, createScaleAreaPrefab, createZoomAreaPrefab, resolvePointleshScene, walkablePolygons } from '@pointlesh/core';
import { createLayer, defineSceneManifest } from '@scene-designer/core';
import { evaluatePointleshAreaEffects } from '../dist/effects.js';

const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
function roomFor(prefabs, instances) {
  const layer = createLayer({ id: 'main' }); layer.prefabs = instances;
  return resolvePointleshScene(defineSceneManifest({ schemaVersion: 2, prefabs: Object.fromEntries(prefabs.map(prefab => [prefab.id, prefab])), scenes: { room: { id: 'room', name: 'Room', width: 100, height: 100, layers: [layer] } } }), 'room');
}

test('one region supplies walking, scale, zoom and occlusion with independent interpolation axes', () => {
  const prefab = createAreaPrefab({ vertices, walkable: true, scaleEnabled: true, zoomEnabled: true, walkBehindEnabled: true, scaleAxis: 'y', zoomAxis: 'x', minScale: 0.5, maxScale: 1, minZoom: 1, maxZoom: 2, smoothing: 3, baseline: 80 });
  const room = roomFor([prefab], [createPointleshInstance({ id: 'floor', prefabId: prefab.id })]);
  assert.equal(walkablePolygons(room).length, 1);
  assert.deepEqual(evaluatePointleshAreaEffects(room.areas, { x: 25, y: 75 }), { scale: 0.875, zoom: 1.25, zoomSmoothing: 3, walkBehindBaseline: 80, activeAreaIds: ['floor'] });
  room.areas[0].properties.zoomEnabled = false;
  assert.deepEqual(evaluatePointleshAreaEffects(room.areas, { x: 25, y: 75 }), { scale: 0.875, zoom: 1, zoomSmoothing: 5, walkBehindBaseline: 80, activeAreaIds: ['floor'] });
  assert.equal(walkablePolygons(room).length, 1);
});

test('overlapping regions override each enabled effect independently and disabled geometry has no effect', () => {
  const prefab = createAreaPrefab({ vertices, walkable: true, scaleEnabled: true, zoomEnabled: true, minScale: 0.5, maxScale: 1, minZoom: 1, maxZoom: 2 });
  const room = roomFor([prefab], [
    createPointleshInstance({ id: 'ground', prefabId: prefab.id }),
    createPointleshInstance({ id: 'local-scale', prefabId: prefab.id, properties: { walkable: false, zoomEnabled: false }, overrides: { minScale: { value: 2 }, maxScale: { value: 2 } } }),
  ]);
  assert.equal(walkablePolygons(room).length, 1, 'A nonwalkable overlapping effect does not subtract ground');
  assert.deepEqual(evaluatePointleshAreaEffects(room.areas, { x: 50, y: 50 }), { scale: 2, zoom: 1.5, zoomSmoothing: 5, activeAreaIds: ['ground', 'local-scale'] });
  for (const area of room.areas) area.enabled = false;
  assert.deepEqual(evaluatePointleshAreaEffects(room.areas, { x: 50, y: 50 }), { scale: 1, zoom: 1, zoomSmoothing: 5, activeAreaIds: [] });
  assert.equal(walkablePolygons(room).length, 0);
  for (const area of room.areas) { area.enabled = true; area.closed = false; }
  assert.deepEqual(evaluatePointleshAreaEffects(room.areas, { x: 50, y: 50 }).activeAreaIds, []);
});

test('legacy scale and zoom definitions retain their endpoint axes and support role disabling', () => {
  const scale = createScaleAreaPrefab({ vertices, axis: 'x', minScale: 0.5, maxScale: 1 });
  const zoom = createZoomAreaPrefab({ vertices, minZoom: 2, maxZoom: 1 });
  const room = roomFor([scale, zoom], [createPointleshInstance({ id: 'scale', prefabId: scale.id }), createPointleshInstance({ id: 'zoom', prefabId: zoom.id })]);
  const effects = evaluatePointleshAreaEffects(room.areas, { x: 25, y: 75 });
  assert.equal(effects.scale, 0.625);
  assert.equal(effects.zoom, 1.25);
  room.areas[0].properties.scaleEnabled = false;
  assert.equal(evaluatePointleshAreaEffects(room.areas, { x: 25, y: 75 }).scale, 1);
});
