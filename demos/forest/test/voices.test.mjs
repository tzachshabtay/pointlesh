import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, linkedAnimationAssetIds, topLevelAiAssetIds } from '@ai-game-assets/core';
import { assertDialogAiAssets, resolveDialogLine } from '@dialog-designer/core';
import { AdventureDialog } from '@pointlesh/core';
import { aiTextureKey } from '@ai-game-assets/phaser';
const { loadForestAssets } = await tsImport('../src/asset-loading.ts', import.meta.url);

const seed = await tsImport('../src/content.ts', import.meta.url);
const authored = {
  assets: JSON.parse(await readFile(new URL('../public/authoring/assets.json', import.meta.url), 'utf8')),
  dialogs: JSON.parse(await readFile(new URL('../public/authoring/dialogs.json', import.meta.url), 'utf8')),
};

test('all speakers can acquire recordings after startup, with resolvable dialogue and playable audio keys', () => {
  const unrecorded = structuredClone(authored.assets);
  const lines = Object.values(unrecorded.assets).filter(asset => asset.kind === 'voice-line');
  for (const line of lines) { line.versions = {}; line.activeVersion = ''; }
  const sessions = Object.keys(authored.dialogs.dialogs).map(id => ({ id, conversation: new AdventureDialog(authored.dialogs, unrecorded) }));
  for (const { id, conversation } of sessions) assert.equal(conversation.start(id).resolved.audio, undefined);
  const recorded = structuredClone(unrecorded);
  const speakers = new Set();
  for (const line of lines) {
    speakers.add(line.voiceSettings.voiceAssetId);
    recorded.assets[line.id].activeVersion = 'test-recording';
    recorded.assets[line.id].versions['test-recording'] = { name: 'test-recording', file: `art/${line.id}.mp3`, prompt: line.prompt,
      model: 'test', createdAt: '2026-10-29T00:00:00Z' };
  }
  for (const id of ['borin', 'elder', 'innkeeper', 'miner', 'chest']) assert.ok(speakers.has(`voice.${id}`), id);
  const queued = new Map();
  loadForestAssets({ textures: { exists: () => false }, load: { image() {}, svg() {}, spritesheet() {}, audio: (key, file) => queued.set(key, file) } }, recorded, '/');
  for (const line of lines) assert.equal(queued.get(aiTextureKey({ assetId: line.id })), `/art/${line.id}.mp3`);
  for (const { id, conversation } of sessions) {
    conversation.setAiAssets(recorded);
    assert.ok(conversation.start(id).resolved.audio);
    conversation.advance();
    const checkpoint = conversation.snapshot();
    for (const option of conversation.current().options) {
      conversation.restore(checkpoint);
      const reply = conversation.choose(option.id);
      assert.equal(reply.resolved.audio.file, `art/${reply.resolved.lineAsset.id}.mp3`);
      assert.equal(queued.has(aiTextureKey({ assetId: reply.resolved.lineAsset.id })), true);
    }
  }
});

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
