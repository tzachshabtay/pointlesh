import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { resolvePointleshScene } from '@pointlesh/core';
const { assets, scenes, atlasRooms } = await tsImport('../src/content.ts', import.meta.url);
const { addFireplace, addFireplaceAssets } = await tsImport('../src/fireplace-assets.ts', import.meta.url);
const png = async file => PNG.sync.read(await readFile(new URL('../public/art/' + file, import.meta.url)));

test('the fireplace is an editable, looping object and repeat upgrades preserve authored changes', () => {
  const object = resolvePointleshScene(scenes, 'pub').objects.find(object => object.id === 'pub.fireplace');
  assert.equal(object.kind, 'object'); assert.equal(object.properties.animationKey, 'burn');
  assert.equal(object.properties.animationLoop, true); assert.equal(object.properties.ignoreScaling, true);
  assert.equal(object.properties.walkThrough, true); assert.equal(object.properties.interactive, false);
  assert.deepEqual(atlasRooms.pub, { asset: 'background.pub', row: null });
  const edited = structuredClone(scenes), catalog = structuredClone(assets);
  edited.scenes.pub.layers[0].prefabs.find(instance => instance.id === 'pub.fireplace').overrides.object.x = 600;
  edited.prefabs['forest.object.fireplace'].pointlesh.properties.animationPlaying = false;
  catalog.assets.fireplace.activeVersion = 'custom';
  catalog.assets.fireplace.linkedAnimationAssets.burn.assetId = 'custom-fire';
  const before = structuredClone(catalog); addFireplaceAssets(catalog);
  assert.deepEqual(catalog, before); assert.deepEqual(addFireplace(edited), edited);
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
