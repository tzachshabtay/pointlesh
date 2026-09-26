import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
const { assets } = await tsImport('../src/content.ts', import.meta.url);
const { addRescueAssets, rescueAssetDefinitions } = await tsImport('../src/rescue-assets.ts', import.meta.url);
const png = async file => PNG.sync.read(await readFile(new URL('../public/' + file, import.meta.url)));

test('rescue artwork has valid alpha frames, fixed ground anchors, and no shrinking between rows', async () => {
  for (const asset of Object.values(rescueAssetDefinitions).filter(asset => asset.kind === 'animation')) {
    const image = await png(asset.versions[asset.activeVersion].file);
    assert.deepEqual([image.width, image.height], [asset.dimensions.width, asset.dimensions.height]);
    const { frameWidth, frameHeight, columns, frameCount } = asset.frameGrid;
    for (let frame = 0; frame < frameCount; frame++) {
      let top = frameHeight, bottom = -1, transparent = false;
      for (let y = 0; y < frameHeight; y++) for (let x = 0; x < frameWidth; x++) {
        const alpha = image.data[((Math.floor(frame / columns) * frameHeight + y) * image.width + frame % columns * frameWidth + x) * 4 + 3];
        if (alpha > 16) { top = Math.min(top, y); bottom = y; }
        if (!alpha) transparent = true;
      }
      assert.ok(bottom > top && transparent, `${asset.id} frame ${frame}: a visible pose on transparent canvas`);
      if (asset.id.startsWith('borin.')) assert.equal(bottom, 179, `${asset.id} frame ${frame}: feet stay on the same baseline`);
      if (asset.id === 'guard.bound') assert.equal(bottom, 195, 'Bound pose stays on the collapse animation ground baseline');
    }
  }
  const closed = await png('art/objects/cage-door.png'), sheet = await png('art/objects/cage-door-open.png');
  for (let y = 0; y < closed.height; y++) assert.deepEqual(
    closed.data.subarray(y * closed.width * 4, (y + 1) * closed.width * 4),
    sheet.data.subarray(y * sheet.width * 4, (y * sheet.width + closed.width) * 4), 'Opening starts on the exact closed door');
});

test('removing the door preserves every background pixel outside its clean plate', async () => {
  const original = await png('art/atlas-mine-camp.png'), clean = await png('art/camp-doorless.png');
  assert.deepEqual([clean.width, clean.height], [1182, 664]);
  let changed = 0;
  for (let y = 0; y < clean.height; y++) for (let x = 0; x < clean.width; x++) {
    const old = ((y + 666) * original.width + x) * 4, next = (y * clean.width + x) * 4;
    const same = original.data.subarray(old, old + 4).equals(clean.data.subarray(next, next + 4));
    if (!same) { changed++; assert.ok(x >= 760 && x < 865 && y >= 221 && y < 407, `Unexpected change to scenery at ${x},${y}`); }
  }
  assert.ok(changed > 1000, 'The old door was actually removed');
});

test('rescue links preserve promoted artwork and custom animations on repeated catalog upgrades', () => {
  const catalog = structuredClone(assets);
  catalog.assets['guard.bound'].activeVersion = 'custom-bound';
  catalog.assets['guard.bound'].versions['custom-bound'] = { name: 'custom-bound', file: 'custom.png' };
  catalog.assets.borin.linkedAnimationAssets['tie-rope-back'].assetId = 'custom-tying';
  const before = structuredClone(catalog);
  addRescueAssets(catalog);
  assert.deepEqual(catalog, before);
  assert.equal(assets.assets['cage-door'].linkedAnimationAssets.open.assetId, 'cage-door.open');
});
