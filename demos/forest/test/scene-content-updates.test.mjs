import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { PNG } from 'pngjs';
import { createObjectPrefab, createPointleshInstance, resolvePointleshScene } from '@pointlesh/core';
const { scenes, assets } = await tsImport('../src/content.ts', import.meta.url);
const { updateForestInteractions } = await tsImport('../src/scene-content-updates.ts', import.meta.url);

test('painted dreamcaps have one hotspot and the chest has one visible, interactive object', async () => {
  const authored = JSON.parse(await readFile(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
  for (const manifest of [scenes, authored]) {
    const forest = resolvePointleshScene(manifest, 'forest'), mine = resolvePointleshScene(manifest, 'mine');
    assert.equal(forest.objects.some(object => object.properties.pickupId === 'mushroom'), false);
    assert.equal(forest.areas.filter(area => area.id === 'mushroom' && area.kind === 'hotspot').length, 1);
    const mushroom = forest.areas.find(area => area.id === 'mushroom');
    assert.ok(forest.points.some(point => point.id === mushroom.properties.walkPointId));
    assert.equal(mine.areas.some(area => area.id === 'tool-chest'), false);
    const chest = mine.objects.find(object => object.id === 'tool-chest');
    assert.equal(chest.assetId, 'tool-chest');
    assert.equal(chest.properties.targetId, 'tool-chest');
    assert.ok(mine.points.some(point => point.id === chest.properties.walkPointId));
    assert.ok(chest.behaviors.includes('forest.interact'));
  }
  const asset = assets.assets['tool-chest'];
  const image = PNG.sync.read(await readFile(new URL('../public/' + asset.versions[asset.activeVersion].file, import.meta.url)));
  assert.equal(image.width, asset.dimensions.width); assert.equal(image.height, asset.dimensions.height);
  assert.ok(image.data.some((value, index) => index % 4 === 3 && value > 200));
  assert.ok(image.data.some((value, index) => index % 4 === 3 && value === 0));
});

test('legacy mushroom conversion preserves custom properties and walk points without resetting other rooms', () => {
  const source = structuredClone(scenes), layer = source.scenes.forest.layers[0];
  const area = layer.areas.find(area => area.pointlesh?.entityId === 'mushroom');
  const walkPointId = area.pointlesh.properties.walkPointId;
  layer.areas = layer.areas.filter(candidate => candidate !== area);
  const prefab = createObjectPrefab({ id: 'forest.object.mushroom', assetId: 'mushroom', properties: { pickupId: 'mushroom', custom: 42 } });
  source.prefabs[prefab.id] = prefab;
  layer.prefabs.push(createPointleshInstance({ id: 'forest.pickup.mushroom', prefabId: prefab.id, properties: { walkPointId }, behaviors: ['forest.interact'] }));
  const before = structuredClone(source), result = updateForestInteractions(source);
  assert.deepEqual(source, before);
  const updated = resolvePointleshScene(result, 'forest').areas.find(area => area.id === 'mushroom');
  assert.equal(updated.properties.custom, 42); assert.equal(updated.properties.walkPointId, walkPointId);
  assert.deepEqual(result.scenes.mine, source.scenes.mine);
  assert.deepEqual(result.scenes.camp, source.scenes.camp);
  assert.deepEqual(updateForestInteractions(result), result);
});
