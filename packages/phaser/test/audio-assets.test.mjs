import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PhaserAdventureAudioAssets, playAdventureAudio } from '../dist/audio-assets.js';
const asset = (file = 'door.mp3') => ({ id: 'door', kind: 'sound', activeVersion: 'active', versions: { active: { file } } });
function fixture() {
  const load = new EventEmitter(), cache = new Map([['original', 'original buffer']]), queued = [];
  load.audio = (key, source) => queued.push({ key, source }); load.isLoading = () => false; load.start = () => {};
  const scene = { load, events: new EventEmitter(), cache: { audio: { remove: key => cache.delete(key) } } };
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
  await assert.rejects(failed, /previous recording is still available/);
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
