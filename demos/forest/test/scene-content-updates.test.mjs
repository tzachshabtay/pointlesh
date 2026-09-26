import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { PNG } from 'pngjs';
import { createObjectPrefab, createPointleshArea, createPointleshInstance, resolvePointleshScene } from '@pointlesh/core';
const { scenes, assets } = await tsImport('../src/content.ts', import.meta.url);
const { updateForestInteractions, updateRescueAssetText, kingRescueReply } = await tsImport('../src/scene-content-updates.ts', import.meta.url);

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

test('old cage copy migrates while custom descriptions and generated version history stay intact', () => {
  const source = structuredClone(scenes);
  const cage = source.scenes.camp.layers[0].prefabs.find(instance => instance.id === 'camp.cage-door');
  cage.pointlesh.properties.description = 'The king is imprisoned above a steep ledge. I need a safe way down.';
  const updated = updateForestInteractions(source);
  assert.match(resolvePointleshScene(updated, 'camp').objects.find(object => object.id === 'camp.cage-door').properties.description, /heavy lock/);
  cage.pointlesh.properties.description = 'My custom cage description';
  assert.equal(resolvePointleshScene(updateForestInteractions(source), 'camp').objects.find(object => object.id === 'camp.cage-door').properties.description, 'My custom cage description');
  const catalog = structuredClone(assets), line = catalog.assets['line.elder.king'];
  line.prompt = line.voiceSettings.text = 'East, through the wood. Aldric’s cage is above a ledge in the orc camp. Take a rope, and find a way to open the lock.';
  line.activeVersion = 'old'; line.versions.old = { name: 'old', file: 'old-speech.mp3', prompt: line.prompt };
  updateRescueAssetText(catalog);
  assert.equal(line.voiceSettings.text, kingRescueReply); assert.equal(line.prompt, kingRescueReply);
  assert.equal(line.activeVersion, ''); assert.match(line.versions.old.prompt, /above a ledge/);
  line.voiceSettings.text = 'Custom dialogue'; updateRescueAssetText(catalog);
  assert.equal(line.voiceSettings.text, 'Custom dialogue');
});

test('the extracted door replaces its old hotspot and bar masks while preserving authored king and approach points', () => {
  const source = structuredClone(scenes), layer = source.scenes.camp.layers[0];
  layer.prefabs = layer.prefabs.filter(instance => instance.id !== 'camp.cage-door');
  layer.areas = layer.areas.filter(area => !area.pointlesh?.entityId.startsWith('camp.cage.'));
  const vertices = [{ id: 'a', x: 600, y: 200 }, { id: 'b', x: 700, y: 200 }, { id: 'c', x: 700, y: 350 }];
  layer.areas.push(createPointleshArea({ id: 'cage::area', entityId: 'cage', kind: 'hotspot', name: 'Cage', closed: true, vertices,
    properties: { walkPointId: 'camp.custom-approach', description: 'A custom locked door' } }));
  for (const name of ['Cage occlusion', 'Cage occulsion 3']) layer.areas.push(createPointleshArea({ id: name, name, vertices, closed: true, walkBehindEnabled: true }));
  const king = layer.prefabs.find(instance => instance.id === 'camp.npc.king');
  king.overrides.object.x = 669; king.overrides.object.y = 333;
  const result = updateForestInteractions(source), camp = resolvePointleshScene(result, 'camp');
  const door = camp.objects.find(object => object.id === 'camp.cage-door');
  assert.equal(door.assetId, 'cage-door');
  assert.equal(door.properties.walkPointId, 'camp.custom-approach');
  assert.equal(door.properties.description, 'A custom locked door');
  assert.equal(camp.areas.some(area => area.id === 'cage' || /^cage occ/i.test(area.name)), false);
  assert.equal(camp.areas.filter(area => area.id.startsWith('camp.cage.')).length, 3);
  assert.deepEqual(camp.objects.find(object => object.id === 'camp.npc.king').position, { x: 669, y: 333 });
  assert.deepEqual(updateForestInteractions(result), result);
  assert.ok(source.scenes.camp.layers[0].areas.some(area => area.pointlesh?.entityId === 'cage'), 'Migration does not mutate its input');
});
