import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { createAreaPrefab, createHotspotPrefab, createCharacterPrefab, createPointleshInstance, resolvePointleshScene } from '@pointlesh/core';
import { createScene, createLayer, defineSceneManifest } from '@scene-designer/core';
const { specializeForestEntities } = await tsImport('../src/entity-prefabs.ts', import.meta.url);
const { scenes: seed } = await tsImport('../src/content.ts', import.meta.url);
const authored = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
const normalized = value => {
  const result = JSON.parse(JSON.stringify(value, (key, value) => ['prefabId', 'instanceId', 'attributeId'].includes(key) ? undefined : value));
  for (const key of ['entities', 'objects', 'areas']) result[key].sort((a, b) => a.id.localeCompare(b.id));
  return result;
};

for (const [label, manifest] of [['seed', seed], ['authored', authored]]) test(`${label} entities own named prefabs and Borin shares defaults across rooms`, () => {
  const characters = new Set(), objects = new Set();
  for (const scene of Object.values(manifest.scenes)) for (const entity of resolvePointleshScene(manifest, scene.id).objects) {
    const identity = entity.properties.role === 'player' ? 'borin' : entity.properties.actorName ?? entity.properties.pickupId ?? entity.properties.targetId;
    assert.equal(entity.prefabId, `forest.${entity.kind}.${identity}`);
    const prefab = manifest.prefabs[entity.prefabId];
    const instance = scene.layers.flatMap(layer => layer.prefabs ?? []).find(instance => instance.id === entity.id);
    assert.equal(instance.pointlesh?.properties?.animations, undefined);
    assert.equal(instance.overrides?.object?.assetId, undefined);
    assert.ok(prefab.name !== 'Character' && prefab.name !== 'Object');
    (entity.kind === 'character' ? characters : objects).add(identity);
  }
  assert.equal(characters.size, 6); assert.equal(objects.size, 3);
  for (const scene of Object.values(manifest.scenes)) for (const area of resolvePointleshScene(manifest, scene.id).areas) {
    assert.equal(area.prefabId, undefined);
    assert.ok(scene.layers.flatMap(layer => layer.areas).some(native => native.id === area.areaId));
  }
  const edited = structuredClone(manifest);
  edited.prefabs['forest.character.borin'].attributes.find(attribute => attribute.id === 'walkStep').number.value = 12;
  for (const scene of Object.values(edited.scenes)) assert.equal(resolvePointleshScene(edited, scene.id).objects.find(object => object.properties.role === 'player').properties.walkStep, 12);
  assert.deepEqual(specializeForestEntities(manifest), manifest);
});

test('named room shapes preserve curved geometry, inherited numbers, extensions and behavior order', () => {
  const base = createAreaPrefab({ walkBehindEnabled: true, baseline: 200, behaviors: ['shared'] });
  const hotspot = createHotspotPrefab();
  const instance = createPointleshInstance({ id: 'foreground', name: 'Foreground', prefabId: base.id,
    properties: { custom: { value: 7 } }, behaviors: ['room'],
    overrides: { baseline: { value: 345 }, area: { vertices: [{ id: 'a', x: -10, y: 350, curve: { cx: 60, cy: 200 } }, { id: 'b', x: 300, y: 400 }, { id: 'c', x: 0, y: 500 }], closed: true } } });
  instance.pointlesh.client = { retained: true };
  const scene = createScene({ id: 'room', name: 'A room' });
  scene.layers = [{ ...createLayer(), prefabs: [instance, createPointleshInstance({ id: 'door', name: 'Door', prefabId: hotspot.id, overrides: { approachX: { value: 80 } } })] }];
  const source = defineSceneManifest({ schemaVersion: 2, prefabs: { [base.id]: base, [hotspot.id]: hotspot }, scenes: { room: scene } });
  const original = structuredClone(source), result = specializeForestEntities(source);
  assert.deepEqual(source, original);
  assert.deepEqual(normalized(resolvePointleshScene(result, 'room')), normalized(resolvePointleshScene(source, 'room')));
  assert.deepEqual(result.scenes.room.layers[0].areas[0].pointlesh.client, { retained: true });
  assert.deepEqual(specializeForestEntities(result), result);
});

test('specialization preserves placement, room-specific overrides, extension data, and behavior dispatch', () => {
  const base = createCharacterPrefab({ assetId: 'hero', properties: { role: 'player', custom: { quest: 'rescue' } }, behaviors: ['shared'] });
  const source = defineSceneManifest({ schemaVersion: 2, prefabs: { [base.id]: base }, scenes: Object.fromEntries(['one', 'two'].map((id, index) => {
    const instance = createPointleshInstance({ id: `${id}.borin`, prefabId: base.id, name: 'Borin', properties: { facing: index ? 'left' : 'right', approachOffsetY: 25 + index, courage: 10 }, behaviors: index ? ['second-room'] : [], overrides: { object: { assetId: 'borin', x: 100 + index, y: 200 + index, scaleX: 2, scaleY: 2 }, walkStep: { value: 12 + index } } });
    instance.pointlesh.client = { retained: true };
    return [id, { ...createScene({ id }), layers: [{ ...createLayer({ id: `${id}.layer` }), prefabs: [instance] }] }];
  })) });
  const original = structuredClone(source), result = specializeForestEntities(source);
  assert.deepEqual(source, original);
  for (const id of ['one', 'two']) {
    assert.deepEqual(normalized(resolvePointleshScene(result, id)), normalized(resolvePointleshScene(source, id)));
    assert.deepEqual(result.scenes[id].layers[0].prefabs[0].pointlesh.client, { retained: true });
  }
  assert.deepEqual(result.prefabs['forest.character.borin'].pointlesh.behaviors, ['shared']);
  assert.deepEqual(specializeForestEntities(result), result);
});
