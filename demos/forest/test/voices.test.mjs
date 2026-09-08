import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, linkedAnimationAssetIds, topLevelAiAssetIds } from '@ai-game-assets/core';
import { assertDialogAiAssets, resolveDialogLine } from '@dialog-designer/core';

const seed = await tsImport('../src/content.ts', import.meta.url);
const authored = {
  assets: JSON.parse(await readFile(new URL('../public/authoring/assets.json', import.meta.url), 'utf8')),
  dialogs: JSON.parse(await readFile(new URL('../public/authoring/dialogs.json', import.meta.url), 'utf8')),
};

for (const [name, { assets, dialogs }] of [['seed', seed], ['authored', authored]]) {
  test(`${name} voice lines appear under their speaker and retain native dialog resolution`, () => {
    assertManifest(assets);
    assertDialogAiAssets(dialogs, assets);
    const topLevel = new Set(topLevelAiAssetIds(assets));
    const lines = Object.values(assets.assets).filter(asset => asset.kind === 'voice-line');
    assert.ok(lines.length > 0);
    const linked = new Set();
    for (const voice of Object.values(assets.assets).filter(asset => asset.kind === 'voice')) {
      assert.ok(topLevel.has(voice.id), `${voice.id} remains selectable in the asset browser`);
      const expected = lines.filter(line => line.voiceSettings?.voiceAssetId === voice.id).map(line => line.id).sort();
      assert.deepEqual(linkedAnimationAssetIds(assets, [voice.id]).sort(), expected);
      for (const link of Object.values(voice.linkedAnimationAssets ?? {})) {
        assert.ok(link.label.trim());
        assert.equal(linked.has(link.assetId), false, `${link.assetId} belongs to only one voice`);
        assert.equal(topLevel.has(link.assetId), false, `${link.assetId} is hidden from standalone assets`);
        linked.add(link.assetId);
      }
    }
    assert.deepEqual([...linked].sort(), lines.map(line => line.id).sort());
    for (const dialog of Object.values(dialogs.dialogs)) {
      for (const block of Object.values(dialog.nodes)) {
        if (block.type !== 'block') continue;
        for (const line of block.lines) {
          const resolved = resolveDialogLine(dialogs, assets, dialog.id, block.id, line.id);
          assert.equal(resolved.voiceAsset.id, line.voiceAssetId);
          assert.equal(resolved.lineAsset.id, line.lineAssetId);
          assert.ok(resolved.text.trim());
          assert.ok(Object.values(resolved.voiceAsset.linkedAnimationAssets).some(link => link.assetId === line.lineAssetId));
        }
      }
    }
    const chestLines = Object.values(assets.assets['voice.chest'].linkedAnimationAssets);
    const greetings = chestLines.filter(link => link.assetId.endsWith('.greeting'));
    assert.equal(greetings.length, 2);
    assert.notEqual(greetings[0].label, greetings[1].label, 'The two chest dialog greetings are distinguishable');
  });
}
