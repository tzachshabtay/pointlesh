import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';

const { assets: seed } = await tsImport('../src/content.ts', import.meta.url);
const { addForestInterfaceAssets, inventoryAssetId } = await tsImport('../src/interface-assets.ts', import.meta.url);
const { items } = await tsImport('../src/story.ts', import.meta.url);
const directory = new URL('../public/', import.meta.url);
const authored = JSON.parse(await readFile(new URL('authoring/assets.json', directory), 'utf8'));

test('all cursor and inventory images have real, distinct click frames under their parent in both catalogs', async () => {
  for (const manifest of [seed, authored]) {
    assertManifest(manifest);
    const topLevel = new Set(topLevelAiAssetIds(manifest));
    for (const id of ['cursor.walk', 'cursor.interact', ...Object.keys(items).map(inventoryAssetId)]) {
      const asset = manifest.assets[id], animation = manifest.assets[asset.linkedAnimationAssets.click.assetId];
      assert.equal(asset.kind, 'image'); assert.equal(asset.frameGrid, undefined);
      assert.ok(topLevel.has(id)); assert.ok(!topLevel.has(animation.id));
      assert.deepEqual(manifest.assetPaths[id], ['Graphics', id.startsWith('cursor.') ? 'Cursors' : 'Inventory']);
      // Verify the generated originals; authored assets may later be regenerated or promoted.
      if (manifest !== seed) continue;
      for (const definition of [asset, animation]) {
        const file = await readFile(new URL(definition.versions[definition.activeVersion].file, directory));
        assert.equal(file.readUInt32BE(16), definition.dimensions.width); assert.equal(file.readUInt32BE(20), definition.dimensions.height);
      }
      const file = await readFile(new URL(animation.versions[animation.activeVersion].file, directory));
      const chunks = [];
      for (let offset = 8; offset < file.length;) {
        const size = file.readUInt32BE(offset);
        if (file.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(file.subarray(offset + 8, offset + 8 + size));
        offset += size + 12;
      }
      const pixels = inflateSync(Buffer.concat(chunks)), width = animation.dimensions.width;
      const frame = index => Buffer.concat(Array.from({ length: 32 }, (_, row) => pixels.subarray(row * (width * 4 + 1) + 1 + index * 32 * 4, row * (width * 4 + 1) + 1 + (index + 1) * 32 * 4)));
      assert.notDeepEqual(frame(0), frame(2), `${id} click changes real pixels`);
      assert.ok(frame(0).some((value, index) => index % 4 === 3 && value === 0), 'Transparent around the icon');
      assert.ok(frame(0).some((value, index) => index % 4 === 3 && value > 0), 'Visible icon pixels');
    }
  }
});

test('catalog additions preserve authored inventory art and unrelated promoted assets', () => {
  const manifest = structuredClone(authored);
  manifest.assets['inventory.rope'].prompt = 'My authored rope';
  manifest.assetPaths['inventory.rope'] = ['Custom'];
  const original = structuredClone(manifest);
  addForestInterfaceAssets(manifest);
  assert.deepEqual(manifest, original);
});
