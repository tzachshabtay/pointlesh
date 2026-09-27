import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
const { addIntroAssets, introAssetDefinitions } = await tsImport('../src/intro-assets.ts', import.meta.url);
const { assets } = await tsImport('../src/content.ts', import.meta.url);

test('intro gestures have complete transparent cells and planted feet throughout both rows', async () => {
  for (const asset of Object.values(introAssetDefinitions)) {
    const image = PNG.sync.read(await readFile(new URL('../public/' + asset.versions[asset.activeVersion].file, import.meta.url)));
    assert.deepEqual([image.width, image.height], [asset.dimensions.width, asset.dimensions.height]);
    const { frameWidth, frameHeight, columns, frameCount } = asset.frameGrid;
    const bottoms = [], tops = [];
    for (let frame = 0; frame < frameCount; frame++) {
      let top = frameHeight, bottom = -1, left = frameWidth, right = -1;
      for (let y = 0; y < frameHeight; y++) for (let x = 0; x < frameWidth; x++) {
        const alpha = image.data[((Math.floor(frame / columns) * frameHeight + y) * image.width + frame % columns * frameWidth + x) * 4 + 3];
        if (alpha > 16) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
        if (x === 0 || y === 0 || x === frameWidth - 1 || y === frameHeight - 1) assert.equal(alpha, 0, `${asset.id}: transparent cell edges`);
      }
      assert.ok(bottom > top && right > left, `${asset.id}: frame ${frame} contains a pose`);
      assert.ok(left >= 2 && right < frameWidth - 2 && top >= 2 && bottom < frameHeight - 2, `${asset.id}: no clipped spear, crown or hand`);
      bottoms.push(bottom); tops.push(top);
    }
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 1, `${asset.id}: feet stay planted across every row`);
    if (asset.id === 'king.hands-up') assert.ok(tops[7] < tops[0] - 10, 'Raised hands extend above the crown without shrinking the king');
    assert.equal(asset.animations[0].repeat, 0, 'Gestures hold their last frame instead of restarting');
  }
});

test('intro registration preserves promoted animation versions and custom character links', () => {
  const manifest = structuredClone(assets);
  manifest.assets['guard.point-spear'].activeVersion = 'user-edit';
  manifest.assets['guard.point-spear'].versions['user-edit'] = { name: 'user-edit', file: 'edited.png' };
  manifest.assets.king.linkedAnimationAssets['hands-up'].assetId = 'custom-hands';
  const before = structuredClone(manifest);
  addIntroAssets(manifest);
  assert.deepEqual(manifest, before);
});
