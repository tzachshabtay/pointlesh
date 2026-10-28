import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { assertManifest } from '@ai-game-assets/core';
const { FootstepCadence, soundtrackFor, footstepFor } = await tsImport('../src/audio-state.ts', import.meta.url);
const { addForestAudio, forestAudio } = await tsImport('../src/audio-assets.ts', import.meta.url);
const { assets } = await tsImport('../src/content.ts', import.meta.url);
const { ForestSoundscape } = await tsImport('../src/soundscape.ts', import.meta.url);
const walker = (x, phase, rest = {}) => ({ id: 'hero', character: 'borin', x, y: 20, phase, walking: true, pan: 0, ...rest });

test('all room, cinematic and walker sound selections have recordings', async () => {
  assertManifest(assets);
  for (const room of ['village', 'pub', 'house', 'forest', 'mine', 'camp']) {
    for (const kind of [undefined, 'intro', 'ending']) assert.ok(forestAudio[soundtrackFor(room, kind)]);
    assert.ok(forestAudio[`ambience.${room}`]);
    for (const actor of ['borin', 'king', 'guard', 'guard-right', 'elder']) {
      for (const n of [1, 2]) assert.ok(forestAudio[`${footstepFor(actor, room)}.${n}`]);
    }
  }
  assert.equal(soundtrackFor('forest', 'intro'), soundtrackFor('camp'));
  assert.equal(soundtrackFor('village', 'ending'), 'music.ending');
  assert.equal(footstepFor('borin', 'pub'), 'step.dwarf-wood');
  assert.equal(footstepFor('borin', 'forest'), 'step.dwarf-earth');
  assert.equal(footstepFor('borin', 'mine'), 'step.dwarf-stone');
  for (const asset of Object.values(forestAudio)) {
    assert.ok((await stat(new URL(`../public/${asset.versions.original.file}`, import.meta.url))).size > 1000, asset.id);
  }
});

test('adding audio preserves promoted recordings and custom folders', () => {
  const manifest = structuredClone(assets);
  manifest.assets['music.tense'].activeVersion = 'custom';
  manifest.assets['music.tense'].versions.custom = { ...manifest.assets['music.tense'].versions.original, name: 'custom', file: 'art/custom.mp3' };
  manifest.assetPaths['music.tense'] = ['My music'];
  const before = structuredClone(manifest);
  addForestAudio(manifest);
  assert.deepEqual(manifest, before);
});

test('footsteps follow both contacts, including movement between animation frames', () => {
  const cadence = new FootstepCadence();
  assert.equal(cadence.tick([walker(0, 0)], 16).length, 0);
  assert.equal(cadence.tick([walker(5, .25)], 150).length, 0);
  assert.equal(cadence.tick([walker(5, .5)], 150).length, 1);
  assert.equal(cadence.tick([walker(10, .75)], 150).length, 0);
  assert.equal(cadence.tick([walker(15, 0)], 150).length, 1);
});

test('idle animation, teleports, pause resets and stopped actors never produce steps', () => {
  const cadence = new FootstepCadence();
  cadence.tick([walker(0, 0)], 16);
  assert.equal(cadence.tick([walker(0, .5)], 200).length, 0);
  assert.equal(cadence.tick([walker(200, 0)], 200).length, 0);
  assert.equal(cadence.tick([walker(205, .5, { walking: false })], 200).length, 0);
  assert.equal(cadence.tick([walker(210, 0)], 200).length, 0);
  cadence.reset();
  assert.equal(cadence.tick([walker(215, .5)], 200).length, 0);
  cadence.tick([], 200);
  assert.equal(cadence.tick([walker(220, 0)], 200).length, 0);
});

test('actors have independent cadences and rapid animation changes cannot chatter', () => {
  const cadence = new FootstepCadence();
  cadence.tick([walker(0, 0), walker(50, .5, { id: 'guard' })], 16);
  assert.deepEqual(cadence.tick([walker(5, .5), walker(55, .75, { id: 'guard' })], 200).map(a => a.id), ['hero']);
  assert.deepEqual(cadence.tick([walker(10, 0), walker(60, 0, { id: 'guard' })], 16).map(a => a.id), ['guard']);
});

test('soundscape fades room changes, ducks speech, loops, mutes and cleans up', () => {
  const doc = new EventTarget(); doc.hidden = false;
  const previousDocument = globalThis.document, previousStorage = globalThis.localStorage;
  globalThis.document = doc;
  const stored = new Map([['pointlesh.audio', JSON.stringify({ music: .38, footsteps: .55, ambience: .38 })]]);
  globalThis.localStorage = { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v) };
  const made = [], callbacks = new Map();
  const scene = {
    events: { on: (key, fn, ctx) => callbacks.set(key, fn.bind(ctx)), once() {}, off: key => callbacks.delete(key) },
    cache: { audio: { exists: () => true } },
    sound: { locked: false, mute: false, add: (key, config) => {
      const events = new Map();
      const sound = { key, ...config, totalDuration: 20, seek: 0, isPlaying: false,
        play() { this.isPlaying = true; return true; }, setVolume(n) { this.volume = n; },
        once(name, fn) { events.set(name, fn); }, destroy() { this.destroyed = true; this.isPlaying = false; events.get('destroy')?.(); } };
      made.push(sound); return sound;
    } },
  };
  const state = { started: false, room: 'village', shot: 'village', walkers: [], speaking: false, menu: false, footstepsPaused: false };
  let soundscape;
  try {
    soundscape = new ForestSoundscape(scene, { key: id => id, manifest: assets }, () => state);
    assert.deepEqual(soundscape.settings, { enabled: true, music: .38, sfx: .55, voices: 1 }, 'legacy preferences migrate to three channels');
    const tick = (n = 20) => { for (let i = 0; i < n; i++) callbacks.get('postupdate')(i * 100, 100); };
    tick(); assert.equal(made.length, 0, 'title is silent until user starts');
    state.started = true; tick();
    assert.deepEqual(made.map(s => s.key), ['music.village', 'ambience.village']);
    assert.equal(made[0].volume, .38);
    const voice = soundscape.playVoice('voice.test');
    assert.equal(voice.volume, 1);
    soundscape.setVolume('voices', .25); assert.equal(voice.volume, .25, 'currently playing speech changes immediately');
    assert.equal(made[0].volume, .38, 'voice volume does not change music');
    state.walkers = [walker(0, 0)]; tick(1);
    state.walkers = [walker(10, .5)]; tick(1);
    const step = made.find(s => s.key.startsWith('step.')); assert.ok(step);
    soundscape.setVolume('sfx', 0); tick();
    assert.equal(step.volume, 0, 'active footsteps follow SFX');
    assert.equal(made[1].destroyed, true, 'ambience follows SFX');
    assert.equal(voice.volume, .25, 'SFX does not change voices');
    assert.equal(made[0].volume, .38, 'SFX does not change music');
    voice.destroy(); step.destroy(); state.walkers = [];
    soundscape.setVolume('sfx', .55); tick();
    const ambience = made.findLast(s => s.key === 'ambience.village');
    assert.ok(Math.abs(ambience.volume - .38) < 1e-8);
    assert.equal(soundscape.playVoice('voice.test').volume, .25, 'new speech uses the current voice volume');
    made.at(-1).destroy();
    state.speaking = true; tick(); assert.equal(made[0].volume, .19);
    state.speaking = false; state.room = 'forest'; tick();
    assert.equal(made[0].destroyed, true); assert.equal(made[1].destroyed, true);
    const forest = made.find(s => s.key === 'music.forest'); forest.seek = 19;
    tick(1); assert.equal(made.filter(s => s.key === 'music.forest').length, 2, 'next loop overlaps tail');
    tick(); assert.equal(forest.destroyed, true);
    soundscape.setEnabled(false); assert.equal(scene.sound.mute, true); assert.ok(made.every(s => s.destroyed));
    tick(); assert.ok(made.every(s => s.destroyed));
    soundscape.setEnabled(true); tick(); assert.ok(made.some(s => !s.destroyed));
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); tick(); assert.ok(made.every(s => s.destroyed));
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); tick(); assert.ok(made.some(s => !s.destroyed));
    soundscape.setVolume('music', 2); assert.equal(soundscape.settings.music, 1);
    assert.equal(JSON.parse(stored.get('pointlesh.audio')).music, 1);
    soundscape.destroy(); assert.ok(made.every(s => s.destroyed)); assert.equal(callbacks.size, 0);
  } finally {
    soundscape?.destroy(); globalThis.document = previousDocument; globalThis.localStorage = previousStorage;
  }
});
