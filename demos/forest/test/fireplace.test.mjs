import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { resolvePointleshScene, pointInPolygon, pointleshAreaCapabilities } from '@pointlesh/core';
const { assets, scenes, atlasRooms } = await tsImport('../src/content.ts', import.meta.url);
const { addFireplace, addFireplaceAssets } = await tsImport('../src/fireplace-assets.ts', import.meta.url);
const png = async file => PNG.sync.read(await readFile(new URL('../public/art/' + file, import.meta.url)));

test('all four fires share an editable looping prefab and repeat upgrades preserve authored changes', () => {
  for (const [id, instance] of [['pub', 'pub.fireplace'], ['house', 'house.fireplace'], ['camp', 'camp.fireplace'], ['camp', 'camp.torch']]) {
    const object = resolvePointleshScene(scenes, id).objects.find(object => object.id === instance);
    assert.equal(object.kind, 'object'); assert.equal(object.properties.animationKey, 'burn');
    assert.equal(object.prefabId, 'forest.object.fireplace');
    assert.equal(object.properties.animationLoop, true); assert.equal(object.properties.ignoreScaling, true);
    assert.equal(object.properties.walkThrough, true); assert.equal(object.properties.interactive, false);
    assert.equal(object.properties.lightEnabled, true);
    assert.deepEqual(atlasRooms[id], { asset: `background.${id}`, row: null });
  }
  const edited = structuredClone(scenes), catalog = structuredClone(assets);
  edited.scenes.pub.layers[0].prefabs.find(instance => instance.id === 'pub.fireplace').overrides.object.x = 600;
  edited.prefabs['forest.object.fireplace'].pointlesh.properties.animationPlaying = false;
  const cottage = edited.scenes.house.layers[0];
  const hearth = cottage.prefabs.find(instance => instance.id === 'house.fireplace');
  hearth.overrides.object.x = 680; hearth.pointlesh.properties.lightIntensity = .25;
  const kettle = cottage.areas.find(area => area.id === 'house.hearth-kettle::area');
  kettle.vertices[0].x += 2;
  const camp = edited.scenes.camp.layers[0];
  camp.prefabs.find(instance => instance.id === 'camp.fireplace').overrides.object.y += 5;
  camp.prefabs.find(instance => instance.id === 'camp.torch').overrides.object.x += 5;
  camp.prefabs.find(instance => instance.id === 'camp.torch').pointlesh.properties.lightIntensity = .4;
  camp.areas.find(area => area.id === 'camp.hearth-cauldron::area').pointlesh.properties.baseline += 5;
  catalog.assets.fireplace.activeVersion = 'custom';
  catalog.assets.fireplace.linkedAnimationAssets.burn.assetId = 'custom-fire';
  const before = structuredClone(catalog); addFireplaceAssets(catalog);
  assert.deepEqual(catalog, before); assert.deepEqual(addFireplace(edited), edited);
  const houseOnly = structuredClone(scenes); delete houseOnly.scenes.pub;
  assert.deepEqual(addFireplace(houseOnly), houseOnly);
  const campOnly = structuredClone(scenes); delete campOnly.scenes.pub; delete campOnly.scenes.house;
  assert.deepEqual(addFireplace(campOnly), campOnly);
});

test('camp clean-plate migration retains previous versions and never replaces a custom promotion', () => {
  const catalog = structuredClone(assets), camp = catalog.assets['background.camp'];
  camp.activeVersion = 'rescue'; delete camp.versions.hearth; delete camp.versions.torch;
  const original = structuredClone(camp.versions.rescue);
  addFireplaceAssets(catalog);
  assert.equal(camp.versions[camp.activeVersion].file, 'art/camp-ambient.png');
  assert.deepEqual(camp.versions.rescue, original);
  camp.activeVersion = 'hearth'; delete camp.versions.torch;
  const hearth = structuredClone(camp.versions.hearth);
  addFireplaceAssets(catalog);
  assert.equal(camp.versions[camp.activeVersion].file, 'art/camp-ambient.png');
  assert.deepEqual(camp.versions.hearth, hearth);
  camp.versions.custom = { ...original, name: 'custom', file: 'art/custom-camp.png' }; camp.activeVersion = 'custom';
  const before = structuredClone(catalog); addFireplaceAssets(catalog); assert.deepEqual(catalog, before);
});

test('the camp cauldron masks the flames while leaving its coal bed and approach walkable', () => {
  const room = resolvePointleshScene(scenes, 'camp');
  const cauldron = room.areas.find(area => area.id === 'camp.hearth-cauldron');
  const fire = room.objects.find(object => object.id === 'camp.fireplace');
  assert.equal(pointleshAreaCapabilities(cauldron).walkBehind, true);
  assert.equal(pointleshAreaCapabilities(cauldron).walkable, false);
  assert.ok(cauldron.properties.baseline > fire.position.y);
  assert.ok(fire.properties.lightDepth > cauldron.properties.baseline);
  assert.ok(fire.properties.lightDepth < 350, 'Light stays below the guard at the drinking point');
  assert.ok(pointInPolygon({ x: 247 * 960 / 1182, y: 375 * 540 / 664 }, cauldron.polygon));
  assert.equal(pointInPolygon({ x: 247 * 960 / 1182, y: 414 * 540 / 664 }, cauldron.polygon), false);
});

test('the cottage pot masks the flames but does not obstruct movement or the flame bed below it', () => {
  const room = resolvePointleshScene(scenes, 'house');
  const kettle = room.areas.find(area => area.id === 'house.hearth-kettle');
  const fire = room.objects.find(object => object.id === 'house.fireplace');
  assert.equal(pointleshAreaCapabilities(kettle).walkBehind, true);
  assert.equal(pointleshAreaCapabilities(kettle).walkable, false);
  assert.ok(kettle.properties.baseline > fire.position.y);
  assert.ok(pointInPolygon({ x: 844 * 960 / 1182, y: 332 * 540 / 664 }, kettle.polygon));
  assert.equal(pointInPolygon({ x: 844 * 960 / 1182, y: 360 * 540 / 664 }, kettle.polygon), false);
});

test('the fire has eight distinct transparent frames, matching dimensions and a matching base image', async () => {
  const sheet = await png('objects/fireplace-burn.png'), base = await png('objects/fireplace.png');
  const asset = assets.assets['fireplace.burn'];
  assert.deepEqual([sheet.width, sheet.height], [asset.dimensions.width, asset.dimensions.height]);
  assert.equal(asset.animations[0].repeat, -1);
  const hashes = new Set();
  for (let index = 0; index < 8; index++) {
    const frame = new PNG({ width: 80, height: 104 });
    PNG.bitblt(sheet, frame, index % 4 * 80, Math.floor(index / 4) * 104, 80, 104, 0, 0);
    hashes.add(createHash('sha256').update(frame.data).digest('hex'));
    const alpha = [...frame.data].filter((_, i) => i % 4 === 3);
    assert.ok(alpha.filter(value => value === 0).length > 4000, 'Transparent scenery overlay');
    assert.ok(alpha.filter(value => value > 128).length > 500, 'Visible fire');
    if (index === 0) assert.deepEqual(base.data, frame.data);
  }
  assert.equal(hashes.size, 8);
});

test('removing the static flames preserves every background pixel outside the firebox', async () => {
  const original = await png('atlas-village-pub.png'), clean = await png('pub-unlit.png');
  assert.deepEqual([clean.width, clean.height], [1182, 664]);
  let changed = 0;
  for (let y = 0; y < clean.height; y++) for (let x = 0; x < clean.width; x++) {
    const old = ((y + 666) * original.width + x) * 4, next = (y * clean.width + x) * 4;
    if (!original.data.subarray(old, old + 4).equals(clean.data.subarray(next, next + 4))) {
      changed++; assert.ok(x >= 709 && x < 791 && y >= 223 && y < 313, `Scenery changed at ${x},${y}`);
    }
  }
  assert.ok(changed > 1000);
});

test('the cottage clean plate preserves its pot and all pixels outside the original fire', async () => {
  const original = await png('atlas-house-forest.png'), clean = await png('house-unlit.png');
  assert.deepEqual([clean.width, clean.height], [1182, 664]);
  let changed = 0;
  for (let y = 0; y < clean.height; y++) for (let x = 0; x < clean.width; x++) {
    const offset = (y * clean.width + x) * 4;
    if (!original.data.subarray(offset, offset + 4).equals(clean.data.subarray(offset, offset + 4))) {
      changed++; assert.ok(x >= 809 && x < 884 && y >= 339 && y < 368, `Scenery changed at ${x},${y}`);
      assert.ok(!(y < 345 && x >= 826 && x < 864 || y < 349 && x >= 834 && x < 858), 'Original pot pixels are preserved');
    }
  }
  assert.ok(changed > 1000);
});

test('the camp clean plate preserves its cage, tripod and scenery outside the flame patch', async () => {
  const original = await png('camp-doorless.png'), clean = await png('camp-unlit.png');
  assert.deepEqual([clean.width, clean.height], [1182, 664]);
  let changed = 0;
  for (let y = 0; y < clean.height; y++) for (let x = 0; x < clean.width; x++) {
    const offset = (y * clean.width + x) * 4;
    if (!original.data.subarray(offset, offset + 4).equals(clean.data.subarray(offset, offset + 4))) {
      changed++; assert.ok(x >= 185 && x < 307 && y >= 369 && y < 434, `Scenery changed at ${x},${y}`);
    }
  }
  assert.ok(changed > 5000);
});

test('the torch clean plate preserves its holder and all previous camp artwork', async () => {
  const original = await png('camp-unlit.png'), clean = await png('camp-ambient.png');
  assert.deepEqual([clean.width, clean.height], [1182, 664]);
  let changed = 0;
  for (let y = 0; y < clean.height; y++) for (let x = 0; x < clean.width; x++) {
    const offset = (y * clean.width + x) * 4;
    if (!original.data.subarray(offset, offset + 4).equals(clean.data.subarray(offset, offset + 4))) {
      changed++; assert.ok(x >= 37 && x < 64 && y >= 214 && y < 267, `Scenery changed at ${x},${y}`);
    }
  }
  assert.ok(changed > 1000);
});
