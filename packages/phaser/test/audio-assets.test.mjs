import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PhaserAdventureAudioAssets, playAdventureAudio } from '../dist/audio-assets.js';
const asset = (file = 'door.mp3') => ({ id: 'door', kind: 'sound', activeVersion: 'active', versions: { active: { file } } });
function fixture() {
  const load = new EventEmitter(), cache = new Map([['original', 'original buffer']]), queued = [];
  load.audio = (key, source) => queued.push({ key, source }); load.isLoading = () => false; load.start = () => {};
  const scene = { load, events: new EventEmitter(), cache: { audio: { remove: key => cache.delete(key), exists: key => cache.has(key) } } };
  const runtime = { key: () => 'original', manifest: { assets: { door: asset() } } };
  const audio = new PhaserAdventureAudioAssets(scene, runtime, '/');
  const complete = (job) => { cache.set(job.key, job.source); load.emit(`filecomplete-audio-${job.key}`); };
  return { audio, scene, load, queued, complete, runtime, cache };
}
test('audition and promotion switch only after decoding, without replacing the playing buffer', async () => {
  const f = fixture();
  const pending = f.audio.select('door', 'data:audio/mpeg;base64,new', asset());
  assert.equal(f.audio.key('door'), 'original');
  f.complete(f.queued[0]); await pending;
  assert.equal(f.audio.key('door'), f.queued[0].key);
  assert.equal(f.runtime.key('door'), 'original', 'audio never becomes a texture preview URL');
  await f.audio.syncManifest(f.runtime.manifest);
  assert.equal(f.audio.key('door'), f.queued[0].key, 'metadata sync does not cancel audition');
  const promoted = { assets: { door: asset('promoted.mp3') } };
  const sync = f.audio.syncManifest(promoted);
  f.complete(f.queued[1]); await sync;
  assert.equal(f.queued[1].source, '/promoted.mp3');
  assert.equal(f.audio.key('door'), f.queued[1].key);
  assert.equal(f.cache.has(f.queued[0].key), false, 'retired audio cache is released');
  f.audio.destroy();
});
test('late results cannot override the newest selection and failed loads keep working audio', async () => {
  const f = fixture();
  const first = f.audio.select('door', 'first.mp3', asset());
  const second = f.audio.select('door', 'second.mp3', asset());
  f.complete(f.queued[1]); await second;
  f.complete(f.queued[0]); await first;
  assert.equal(f.cache.has(f.queued[0].key), false, 'discard obsolete decoded data');
  assert.equal(f.audio.key('door'), f.queued[1].key);
  const failed = f.audio.select('door', 'broken.mp3', asset());
  f.load.emit('loaderror', { key: f.queued[2].key });
  const rejected = assert.rejects(failed, /previous recording is still available/);
  await Promise.resolve();
  f.load.emit('loaderror', { key: f.queued[3].key });
  await rejected;
  assert.equal(f.audio.key('door'), f.queued[1].key);
  f.audio.destroy();
});
test('duplicate callbacks share a load and shutdown ignores pending results', async () => {
  const f = fixture();
  const a = f.audio.select('door', 'new.mp3', asset()), b = f.audio.select('door', 'new.mp3', asset());
  assert.equal(a, b); assert.equal(f.queued.length, 1);
  f.audio.destroy(); f.complete(f.queued[0]); await a;
  assert.equal(f.audio.key('door'), 'original');
});

test('a previously unrecorded voice line becomes playable after batch promotion', async () => {
  const f = fixture();
  const line = { id: 'line.elder.greeting', kind: 'voice-line', activeVersion: '', versions: {} };
  f.runtime.manifest.assets[line.id] = line;
  await f.audio.syncManifest(f.runtime.manifest);
  assert.equal(f.queued.length, 0);
  const recorded = { ...line, activeVersion: 'generated', versions: { generated: { file: 'art/elder-greeting.mp3' } } };
  const sync = f.audio.syncManifest({ assets: { ...f.runtime.manifest.assets, [line.id]: recorded } });
  assert.equal(f.queued[0].source, '/art/elder-greeting.mp3');
  f.complete(f.queued[0]); await sync;
  assert.equal(f.audio.key(line.id), f.queued[0].key);
  assert.equal(f.cache.get(f.audio.key(line.id)), '/art/elder-greeting.mp3');
  f.audio.destroy();
});

test('edited speech keeps historical takes without playing stale audio, and a new audition remains playable', async () => {
  const f = fixture(), id = 'line.edited';
  const recorded = { id, kind: 'voice-line', activeVersion: 'take', voiceSettings: { text: 'Old line.' },
    versions: { take: { file: 'old.mp3', recordedText: 'Old line.', voiceSettings: { text: 'Old line.' } } } };
  const first = f.audio.syncManifest({ assets: { [id]: recorded } });
  f.complete(f.queued[0]); await first;
  assert.equal(f.audio.isCurrentVoiceRecording(id), true);
  const edited = structuredClone(recorded); edited.voiceSettings.text = 'New line.'; edited.versions.take.voiceSettings.text = 'New line.';
  await f.audio.syncManifest({ assets: { [id]: edited } });
  assert.equal(f.audio.voiceText(id, 'fallback'), 'New line.');
  assert.equal(f.audio.isCurrentVoiceRecording(id), false);
  assert.equal(f.queued.length, 1, 'changing script text does not reload the historical take');
  const audition = structuredClone(edited);
  audition.activeVersion = 'fresh';
  audition.versions.fresh = { file: 'fresh.mp3', recordedText: 'New line.', voiceSettings: { text: 'New line.' } };
  const preview = f.audio.select(id, 'data:audio/mpeg;base64,fresh', audition);
  f.complete(f.queued[1]); await preview;
  assert.equal(f.audio.isCurrentVoiceRecording(id), true);
  assert.equal(f.audio.voiceText(id, 'fallback'), 'New line.');
  f.audio.destroy();
});

test('changing an interaction speaker does not play the old speaker recording', async () => {
  const f = fixture(), id = 'line.speaker';
  const oldTake = { id, kind: 'voice-line', activeVersion: 'take', voiceSettings: { voiceAssetId: 'voice.elder', text: 'Hello.' },
    versions: { take: { file: 'elder.mp3', voiceSettings: { voiceAssetId: 'voice.elder', text: 'Hello.' } } } };
  const first = f.audio.syncManifest({ assets: { [id]: oldTake } }); f.complete(f.queued[0]); await first;
  assert.equal(f.audio.isCurrentVoiceRecording(id), true);
  const switched = structuredClone(oldTake); switched.voiceSettings.voiceAssetId = 'voice.borin';
  await f.audio.syncManifest({ assets: { [id]: switched } });
  assert.equal(f.audio.isCurrentVoiceRecording(id), false);
  const fresh = structuredClone(switched); fresh.activeVersion = 'new';
  fresh.versions.new = { file: 'borin.mp3', voiceSettings: { voiceAssetId: 'voice.borin', text: 'Hello.' } };
  const loaded = f.audio.syncManifest({ assets: { [id]: fresh } }); f.complete(f.queued[1]); await loaded;
  assert.equal(f.audio.isCurrentVoiceRecording(id), true);
  f.audio.destroy();
});


test('deleting the final promoted recording clears cached playback without clearing unpromoted auditions', async () => {
  const f = fixture();
  const sync = f.audio.syncManifest({ assets: { door: asset('recorded.wav') } });
  f.complete(f.queued[0]); await sync;
  await f.audio.syncManifest({ assets: { door: { ...asset(), activeVersion: '', versions: {} } } });
  assert.equal(f.cache.has(f.audio.key('door')), false);
  const audition = f.audio.select('door', 'draft.wav', asset());
  f.complete(f.queued[1]); await audition;
  await f.audio.syncManifest({ assets: { door: { ...asset(), activeVersion: '', versions: {} } } });
  assert.equal(f.cache.has(f.audio.key('door')), true, 'An unpromoted draft on an empty line remains selected');
  f.audio.destroy();
});


test('deleting a first recording while its audio is still loading cancels the pending playback', async () => {
  const f = fixture();
  const line = { id: 'new-line', kind: 'voice-line', activeVersion: 'take', versions: { take: { file: 'take.wav' } } };
  const loading = f.audio.syncManifest({ assets: { [line.id]: line } });
  await f.audio.syncManifest({ assets: { [line.id]: { ...line, activeVersion: '', versions: {} } } });
  f.complete(f.queued[0]); await loading;
  assert.equal(f.cache.has(f.queued[0].key), false);
  assert.equal(f.cache.has(f.audio.key(line.id)), false);
  f.audio.destroy();
});


test('trim metadata updates the selected take without decoding again or disturbing an audition', async () => {
  const f = fixture();
  const next = { assets: { door: asset('recorded.wav') } };
  const sync = f.audio.syncManifest(next); f.complete(f.queued[0]); await sync;
  const edited = structuredClone(next);
  edited.assets.door.versions.active.audioPlayback = { trimStartSeconds: .2, trimEndSeconds: 1.2 };
  await f.audio.syncManifest(edited);
  assert.deepEqual(f.audio.asset('door').versions.active.audioPlayback, { trimStartSeconds: .2, trimEndSeconds: 1.2 });
  assert.equal(f.queued.length, 1);
  f.audio.destroy();
});

test('voice playback uses the favorite take trim and rate, with completion at its end marker', () => {
  const calls = [];
  const sound = { totalDuration: 4, volume: .4, mute: false, detune: 0, loop: false, addMarker: marker => calls.push(marker), play: config => { calls.push(config); return true; } };
  const voice = { ...asset(), audioPlayback: { trimStartSeconds: 0, trimEndSeconds: 4, playbackRate: 1 }, versions: { active: { file: 'voice.wav', audioPlayback: { trimStartSeconds: .4, trimEndSeconds: 2.8, playbackRate: .9 } } } };
  assert.equal(playAdventureAudio(sound, voice), true);
  assert.deepEqual(calls, [{ name: 'pointlesh-playable-region', start: .4, duration: 2.4, config: { volume: .4, mute: false, detune: 0, loop: false, rate: .9 } }, 'pointlesh-playable-region']);
  calls.length = 0;
  assert.equal(playAdventureAudio(sound, asset()), true);
  assert.deepEqual(calls, [{ rate: 1 }]);
});


test('selected voice take switches captions with audio and preserves the published script', async () => {
  const f = fixture();
  const original = { ...asset('old.wav'), kind: 'voice-line', voiceSettings: { text: 'Original sentence' } };
  f.runtime.manifest.assets.door = original;
  const draft = { ...original, versions: { active: { file: 'draft.wav', voiceSettings: { text: 'New sentence' } } } };
  const loading = f.audio.select('door', 'draft.wav', draft);
  assert.equal(f.audio.voiceText('door', 'fallback'), 'Original sentence');
  f.complete(f.queued[0]); await loading;
  assert.equal(f.audio.voiceText('door', 'fallback'), 'New sentence');
  assert.equal(original.voiceSettings.text, 'Original sentence');
  assert.equal(f.audio.voiceText(undefined, 'Narration'), 'Narration');
  f.audio.destroy();
});


test('decode failures retry with a fresh request and install the saved recording', async () => {
  const f = fixture();
  const saved = { assets: { door: asset('art/new-take.mp3') } };
  const pending = f.audio.syncManifest(saved);
  const first = f.queued[0];
  // Phaser does not emit loaderror on decode failure, only queue completion.
  f.load.emit('complete');
  await Promise.resolve();
  assert.equal(f.queued.length, 2);
  assert.match(f.queued[1].source, /^\/art\/new-take\.mp3\?_pointlesh_audio_retry=/);
  f.complete(f.queued[1]); await pending;
  f.complete(first);
  assert.equal(f.cache.has(first.key), false);
  assert.equal(f.audio.key('door'), f.queued[1].key);
  await f.audio.syncManifest(saved);
  assert.equal(f.queued.length, 2, 'metadata refresh preserves the recovered buffer');
  f.audio.destroy();
});

test('changing a selection during retry does not resurrect the failed take', async () => {
  const f = fixture();
  const failed = f.audio.select('door', 'old.mp3', asset());
  f.load.emit('complete');
  const newest = f.audio.select('door', 'newest.mp3', asset());
  await Promise.resolve();
  assert.equal(f.queued.length, 2, 'cancelled retry is not queued');
  f.complete(f.queued[1]); await newest; await failed;
  assert.equal(f.audio.key('door'), f.queued[1].key);
  f.audio.destroy();
});
