import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';
const { assets, scenes } = await tsImport('../src/content.ts', import.meta.url);
const { spokenLines } = await tsImport('../src/spoken-lines.ts', import.meta.url);
const { addGameSpeechAssets, resolveGameSpeech, cutsceneSpeechLine } = await tsImport('../src/speech-assets.ts', import.meta.url);
const story = await tsImport('../src/story.ts', import.meta.url);

test('Borin arrival and every scripted character line are linked under the correct voice', () => {
  assertManifest(assets);
  const top = new Set(topLevelAiAssetIds(assets));
  const arrival = resolveGameSpeech(assets, story.introArrivalLine);
  assert.equal(arrival.lineAssetId, 'line.game.borin.intro-arrival');
  for (const line of Object.values(spokenLines)) {
    const resolved = resolveGameSpeech(assets, line.text, line.voice);
    assert.ok(resolved.lineAssetId, line.text);
    const asset = assets.assets[resolved.lineAssetId], voice = assets.assets[`voice.${line.voice}`];
    assert.equal(asset.voiceSettings.voiceAssetId, voice.id);
    assert.ok(Object.values(voice.linkedAnimationAssets).some(link => link.assetId === asset.id));
    assert.equal(top.has(asset.id), false);
    assert.equal(asset.voiceSettings.direction, '');
  }
  assert.ok(top.has('voice.king')); assert.ok(top.has('voice.guard'));
});

test('all puzzle responses, item combinations, descriptions and hints have voice lines', () => {
  const check = (text, speaker = 'Borin') => {
    if (text) assert.ok(resolveGameSpeech(assets, text, speaker).lineAssetId, `${speaker}: ${text}`);
  };
  const flags = ['guardAsleep', 'guardBound', 'knowsDreamcap', 'knowsPassword', 'chestOpen', 'tookPickaxe', 'guardDistracted'];
  for (let bits = 0; bits < 2 ** flags.length; bits++) {
    const state = story.newStory();
    state.flags = Object.fromEntries(flags.map((flag, i) => [flag, !!(bits & 2 ** i)]));
    for (const [room, targets] of Object.entries(story.targets)) {
      state.roomId = room;
      for (const target of targets) for (const item of [undefined, ...Object.keys(story.items)]) {
        const next = structuredClone(state); next.inventory = Object.keys(story.items);
        const result = story.interact(next, target.id, item); check(result.text, result.speaker);
      }
    }
  }
  const hintFlags = ['tookCoin','tookRope','knowsDreamcap','knowsPassword','boughtStout','tookMushroom','mixedBrew','chestOpen','tookPickaxe','stewSpiked','guardAsleep','guardBound','won'];
  const hintState = story.newStory(); check(story.hint(hintState));
  for (const flag of hintFlags) { hintState.flags[flag] = true; check(story.hint(hintState)); }
  for (const first of Object.keys(story.items)) for (const second of Object.keys(story.items)) {
    const state = story.newStory(); check(story.combineItems(state, first, second));
    state.inventory = Object.keys(story.items); check(story.combineItems(state, first, second));
  }
  for (const item of Object.values(story.items)) check(item.description);
  const state = story.newStory(); state.inventory = ['sleepyStout', 'rope'];
  check(story.finishPouringBrew(state).text); state.flags.guardAsleep = true; state.tyingGuard = { elapsedMs: 0 };
  check(story.finishTyingGuard(state).text);
});

test('every cinematic line resolves to its character or narrator, and explicit interaction recordings win', () => {
  for (const kind of ['intro', 'ending']) for (const [index, step] of story[kind].entries()) {
    const id = cutsceneSpeechLine(assets, kind, index);
    assert.ok(id, `${kind}:${index}`);
    assert.equal(assets.assets[id].voiceSettings.text, step.text);
    if (step.narration) assert.equal(assets.assets[id].voiceSettings.voiceAssetId, 'voice.narrator');
    else assert.notEqual(assets.assets[id].voiceSettings.voiceAssetId, 'voice.narrator');
  }
  const manifest = structuredClone(assets);
  const id = 'line.game.borin.intro-arrival', line = manifest.assets[id];
  line.activeVersion = 'recorded'; line.versions.recorded = { name: 'recorded', file: 'arrival.mp3', voiceSettings: { text: 'Edited arrival', voiceAssetId: 'voice.borin' } };
  assert.equal(resolveGameSpeech(manifest, story.introArrivalLine).text, 'Edited arrival');
  const before = structuredClone(manifest); addGameSpeechAssets(manifest, scenes);
  assert.deepEqual(manifest, before, 'Registration preserves promoted audio and edited text');
  assert.equal(resolveGameSpeech(manifest, story.introArrivalLine, 'Borin', 'interaction.selection').lineAssetId, 'interaction.selection');
});
