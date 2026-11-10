import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCharacterPrefab, createObjectPrefab, createPointPrefab, createPointleshArea, createPointleshInstance } from '@pointlesh/core';
import { createLayer, createObject, createScene } from '@scene-designer/core';
import { sceneGroupItems } from '../dist/scene-groups.js';

test('scene groups collect instances by kind across layers without changing scene data', () => {
  const character = createCharacterPrefab({ id: 'borin', name: 'Borin' });
  const object = createObjectPrefab({ id: 'door', name: 'Cottage door · outside' });
  const point = createPointPrefab({ id: 'entry', name: 'Entry point' });
  const scene = createScene({ id: 'village', name: 'Bramblehollow' });
  const foreground = createLayer({ id: 'foreground', name: 'Foreground' });
  const background = createLayer({ id: 'background', name: 'Background' });
  foreground.prefabs = [createPointleshInstance({ id: 'hero', prefabId: character.id }), createPointleshInstance({ id: 'entry-1', prefabId: point.id })];
  background.prefabs = [createPointleshInstance({ id: 'door-1', prefabId: object.id })];
  background.objects.push(createObject({ id: 'legacy-object', tag: 'Legacy sign' }));
  background.areas.push(createPointleshArea({ id: 'ground', kind: 'area', name: 'Ground' }), createPointleshArea({ id: 'well', kind: 'hotspot', name: 'Well' }));
  scene.layers = [foreground, background];
  const manifest = { schemaVersion: 2, prefabs: { borin: character, door: object, entry: point }, scenes: { village: scene } };
  const before = structuredClone(manifest);
  const items = sceneGroupItems(manifest, 'village');
  assert.deepEqual(items.map(item => [item.id, item.kind, item.name]), [
    ['hero', 'character', 'Borin'], ['entry-1', 'point', 'Entry point'], ['door-1', 'object', 'Cottage door · outside'],
    ['legacy-object', 'object', 'Legacy sign'], ['ground', 'area', 'Ground'], ['well', 'hotspot', 'Well'],
  ]);
  assert.deepEqual(manifest, before);
});

test('Bramblehollow doors are objects rather than group headings', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../../demos/forest/public/authoring/scenes.json', import.meta.url), 'utf8'));
  const items = sceneGroupItems(manifest, 'village');
  assert.deepEqual(new Set(items.map(item => item.kind)), new Set(['character', 'object', 'point', 'area', 'hotspot']));
  assert.deepEqual(items.filter(item => item.name === 'Copper Tankard door · outside').map(item => item.kind), ['object']);
});
