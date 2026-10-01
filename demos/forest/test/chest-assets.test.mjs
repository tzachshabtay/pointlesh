import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
const { assets, scenes } = await tsImport('../src/content.ts', import.meta.url);
const { CHEST_OPEN_DURATION_MS, addChestAssets } = await tsImport('../src/chest-assets.ts', import.meta.url);
const { resolvePointleshScene } = await import('@pointlesh/core');
const load = file => readFile(new URL('../public/art/objects/' + file, import.meta.url)).then(bytes => PNG.sync.read(bytes));

test('the chest opens once into a held pickaxe pose and has a separate empty pose', async () => {
  const chest = assets.assets['tool-chest'], open = assets.assets['tool-chest.open'], empty = assets.assets['tool-chest.empty'];
  assert.equal(chest.kind, 'image'); assert.deepEqual(chest.dimensions, { width: 120, height: 120 });
  assert.equal(chest.linkedAnimationAssets.open.assetId, open.id); assert.equal(chest.linkedAnimationAssets.empty.assetId, empty.id);
  assert.deepEqual(open.animations[0].frames, [0,1,2,3,4,5,6,7]); assert.equal(open.animations[0].repeat, 0);
  assert.deepEqual(empty.animations[0].frames, [8]); assert.equal(CHEST_OPEN_DURATION_MS, 2000);
  const object = resolvePointleshScene(scenes, 'mine').objects.find(object => object.id === 'tool-chest');
  assert.equal(object.properties.animationPlaying, false); assert.equal(object.properties.animationLoop, false);
  const [original, padded, sheet] = await Promise.all(['runed-tool-chest.png', 'runed-tool-chest-padded.png', 'runed-tool-chest-open.png'].map(load));
  for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
    const pixel = padded.data.subarray((y*120+x)*4, (y*120+x)*4+4);
    assert.deepEqual(pixel, sheet.data.subarray((y*360+x)*4, (y*360+x)*4+4));
    if (y >= 40) assert.deepEqual(pixel, original.data.subarray(((y-40)*120+x)*4, ((y-40)*120+x)*4+4));
    else assert.equal(pixel[3], 0);
  }
  assert.deepEqual({ width: sheet.width, height: sheet.height }, open.dimensions);
  for (let frame = 0; frame < 9; frame++) {
    let pixels = 0, bottom = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      const alpha = sheet.data[((Math.floor(frame/3)*120+y)*360+(frame%3)*120+x)*4+3];
      if (alpha >= 32) { pixels++; bottom = y; assert.ok(x > 0 && x < 119 && y > 0 && y < 119, 'Never crop a raised lid'); }
    }
    assert.ok(pixels > 2500); assert.equal(bottom, 116, 'Every chest pose has the same ground anchor');
  }
});

test('adding chest animations preserves promoted images and existing animation history', () => {
  const catalog = structuredClone(assets);
  catalog.assets['tool-chest'].activeVersion = 'custom';
  catalog.assets['tool-chest'].versions.custom = { ...catalog.assets['tool-chest'].versions.opening, file: 'custom.png' };
  catalog.assets['tool-chest.open'].prompt = 'An authored opening';
  const before = structuredClone(catalog); addChestAssets(catalog); assert.deepEqual(catalog, before);
});
