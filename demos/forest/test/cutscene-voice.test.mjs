import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';
const { CutsceneVoice } = await tsImport('../src/cutscene-voice.ts', import.meta.url);
const { addNarratorAssets, narrationLineId } = await tsImport('../src/narrator-assets.ts', import.meta.url);
const { intro, ending } = await tsImport('../src/story.ts', import.meta.url);

test('all narration passages are linked audio-only assets and authored recordings survive refresh', () => {
  const manifest = { schemaVersion: 1, assets: {} };
  addNarratorAssets(manifest); assertManifest(manifest);
  assert.deepEqual(topLevelAiAssetIds(manifest), ['voice.narrator']);
  const links = Object.values(manifest.assets['voice.narrator'].linkedAnimationAssets);
  assert.equal(links.length, 3);
  for (const kind of ['intro', 'ending']) {
    for (const [index, step] of (kind === 'intro' ? intro : ending).entries()) {
      const id = narrationLineId(kind, index);
      if (!step.narration) { assert.equal(id, undefined, 'Character dialogue is not assigned to the narrator'); continue; }
      const line = manifest.assets[id];
      assert.equal(line.kind, 'voice-line');
      assert.equal(line.voiceSettings.voiceAssetId, 'voice.narrator');
      assert.equal(line.voiceSettings.text, step.text);
      assert.equal(line.voiceSettings.direction, '');
      assert.ok(links.some(link => link.assetId === id));
    }
  }
  assert.ok(Object.values(manifest.assets).every(a => a.kind === 'voice' || a.kind === 'voice-line'));
  const first = manifest.assets[links[0].assetId];
  first.activeVersion = 'generated'; first.versions.generated = { file: 'my-narration.mp3' };
  manifest.assets['voice.narrator'].prompt = 'My custom narrator';
  const before = structuredClone(manifest); addNarratorAssets(manifest);
  assert.deepEqual(manifest, before);
});

function fixture() {
  const played = [];
  const voice = new CutsceneVoice(id => {
    const callbacks = {};
    const sound = { id, isPlaying: true, isPaused: false, totalDuration: 10, seek: 0,
      setSeek(value) { this.seek = value; },
      pause() { this.isPlaying = false; this.isPaused = true; },
      resume() { this.isPlaying = true; this.isPaused = false; },
      stop() { this.isPlaying = this.isPaused = false; },
      destroy() { this.destroyed = true; this.stop(); callbacks.destroy?.(); },
      once(name, callback) { callbacks[name] = callback; },
    };
    played.push(sound); return sound;
  });
  return { voice, played };
}
test('narration plays once per shot, pauses with menus, holds the final pose and stops on skip', () => {
  const { voice, played } = fixture();
  voice.sync('intro:0', 'dawn', 0); voice.sync('intro:0', 'dawn', 1000);
  assert.equal(played.length, 1);
  voice.pause(true); assert.equal(played[0].isPaused, true);
  voice.pause(false); assert.equal(played[0].isPlaying, true);
  assert.equal(voice.tickDelta(100, 5690, 6000), 10);
  assert.equal(voice.tickDelta(100, 5700, 6000), 0);
  played[0].destroy(); assert.equal(voice.tickDelta(100, 5700, 6000), 100);
  voice.sync('intro:1', undefined, 0); assert.equal(played.length, 1);
  voice.sync('intro:2', 'camp', 0); voice.reset();
  assert.equal(played[1].destroyed, true);
  voice.sync('intro:0', 'dawn', 0); assert.equal(played.length, 3, 'New game replays narration');
});
test('restored narration seeks to the saved shot time and completed audio stays silent', () => {
  const { voice, played } = fixture();
  voice.sync('ending:3', 'homecoming', 2500); assert.equal(played[0].seek, 2.5);
  voice.reset(); voice.sync('ending:3', 'homecoming', 12000);
  assert.equal(played[1].destroyed, true);
  voice.sync('ending:3', 'homecoming', 12001); assert.equal(played.length, 2);
  const silent = new CutsceneVoice(() => undefined);
  silent.sync('intro:0', 'not-generated', 0);
  assert.equal(silent.tickDelta(100, 5999, 6000), 100, 'Ungenerated narration never blocks the game');
});
