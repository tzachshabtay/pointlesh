import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { AdventureDialog, resolveInteraction } from '@pointlesh/core';
import { topLevelAiAssetIds } from '@ai-game-assets/core';
const { assets, dialogs, scenes, addChestGuesses } = await tsImport('../src/content.ts', import.meta.url);
const { createForestInteractions } = await tsImport('../src/interactions.ts', import.meta.url);
const { newStory, lookAtTarget, applyDialogChoice, finishOpeningChest, interact, targets } = await tsImport('../src/story.ts', import.meta.url);
const { resolveGameSpeech } = await tsImport('../src/speech-assets.ts', import.meta.url);
const authored = name => JSON.parse(readFileSync(new URL(`../public/authoring/${name}.json`, import.meta.url), 'utf8'));

test('the opening reply uses narrator voice in both seeded and saved dialogs', () => {
  for (const [dialogManifest, assetManifest] of [[dialogs, assets], [authored('dialogs'), authored('assets')]]) {
    const conversation = new AdventureDialog(dialogManifest, assetManifest);
    conversation.start('chest-open'); conversation.advance();
    const turn = conversation.choose('open-chest');
    assert.equal(turn.type, 'line');
    assert.equal(turn.resolved.voiceAsset.id, 'voice.narrator');
    assert.match(turn.resolved.text, /runes glow/);
    const id = turn.resolved.lineAsset.id;
    assert.ok(Object.values(assetManifest.assets['voice.narrator'].linkedAnimationAssets).some(link => link.assetId === id));
    assert.ok(!Object.values(assetManifest.assets['voice.chest'].linkedAnimationAssets).some(link => link.assetId === id));
    assert.ok(!topLevelAiAssetIds(assetManifest).includes(id));
  }
});

test('looking at the chest follows closed, open-with-pickaxe and empty states, with Borin voice lines', () => {
  const state = newStory(); state.roomId = 'mine'; state.flags.knowsPassword = true;
  const description = targets.mine.find(target => target.id === 'tool-chest').description;
  assert.equal(lookAtTarget(state, 'tool-chest', description), description);
  applyDialogChoice(state, 'open-chest'); finishOpeningChest(state);
  const full = resolveGameSpeech(assets, lookAtTarget(state, 'tool-chest', description));
  assert.equal(full.voice, 'borin');
  assert.equal(full.lineAssetId, 'line.game.borin.look-chest-open');
  assert.deepEqual(state.inventory, [], 'Looking must not take the pickaxe');
  interact(state, 'tool-chest');
  const empty = resolveGameSpeech(assets, lookAtTarget(state, 'tool-chest', description));
  assert.equal(empty.voice, 'borin');
  assert.equal(empty.lineAssetId, 'line.game.borin.look-chest-empty');
  assert.notEqual(empty.text, full.text);
  for (const manifest of [createForestInteractions(scenes), authored('interactions')]) {
    assert.equal(resolveInteraction(manifest, 'prefab:forest.object.tool-chest', 'verb:look').cell.kind, 'code', 'A static table cell must not override the stateful description');
  }
});
