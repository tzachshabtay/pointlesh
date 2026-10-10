import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLayer, defineSceneManifest } from '@scene-designer/core';
import { createCharacterPrefab, createObjectPrefab, createHotspotPrefab, createInventoryItemPrefab, createPointleshInstance } from '../dist/index.js';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';
import { assertInteractionManifest, createInteractionPlaybackState, interactionTargets, interactionVoiceLineId, runInteraction, syncInteractionVoiceLines } from '../dist/index.js';

const make = () => ({ schemaVersion: 1, heroVoiceAssetId: 'hero', verbs: [{ id: 'look', label: 'Look' }, { id: 'push', label: 'Push' }, { id: 'talk', label: 'Talk' }],
  cells: { chest: { 'verb:look': { kind: 'simple', text: 'A stubborn chest.' }, 'verb:push': { kind: 'code' }, 'item:chest': { kind: 'impossible' } } } });
const assets = () => ({ schemaVersion: 1, assets: { hero: { id: 'hero', kind: 'voice', prompt: 'The hero', activeVersion: '', versions: {} } } });

test('speech and code dispatch, while red X metadata without a default has no runtime effect', async () => {
  const manifest = make(); assertInteractionManifest(manifest); const calls = [];
  const handlers = { say: (...args) => calls.push(['speech', ...args]), code: (...args) => calls.push(['code', ...args]), impossible: (...args) => calls.push(['impossible', ...args]) };
  assert.equal(await runInteraction(manifest, 'chest', 'verb:talk', handlers), false);
  assert.equal(await runInteraction(manifest, 'chest', 'verb:look', handlers), true);
  assert.equal(await runInteraction(manifest, 'chest', 'verb:push', handlers), true);
  assert.equal(await runInteraction(manifest, 'chest', 'item:chest', handlers), false);
  assert.deepEqual(calls, [['speech', 'A stubborn chest.', interactionVoiceLineId('chest', 'verb:look')], ['code', 'chest', 'verb:push']]);
  await assert.rejects(runInteraction(manifest, 'chest', 'verb:push', { say() {} }), /No game handler/);
  assert.throws(() => assertInteractionManifest({ ...manifest, verbs: [manifest.verbs[0], manifest.verbs[0]] }), /unique/);
  assert.throws(() => assertInteractionManifest({ ...manifest, cells: { chest: { 'verb:look': { kind: 'simple', text: ' ' } } } }), /speech text/);
});

test('speech sync links native voice lines, retains generated history, and disables stale recordings', () => {
  const manifest = make(), source = assets(), id = interactionVoiceLineId('chest', 'verb:look');
  const first = syncInteractionVoiceLines(manifest, source); assertManifest(first);
  assert.equal(source.assets[id], undefined);
  assert.equal(first.assets[id].voiceSettings.text, 'A stubborn chest.');
  assert.equal(first.assets.hero.linkedAnimationAssets[id].assetId, id);
  assert.equal(topLevelAiAssetIds(first).includes(id), false);
  first.assets[id].activeVersion = 'recorded';
  first.assets[id].versions.recorded = { name: 'recorded', file: 'speech.mp3', prompt: 'Speak', model: 'test', createdAt: '2026-10-03T00:00:00Z', voiceSettings: { voiceAssetId: 'hero', text: 'A stubborn chest.' } };
  assert.equal(syncInteractionVoiceLines(manifest, first).assets[id].activeVersion, 'recorded');
  manifest.cells.chest['verb:look'].text = 'It is open!';
  const next = syncInteractionVoiceLines(manifest, first);
  assert.equal(next.assets[id].activeVersion, '');
  assert.equal(next.assets[id].versions.recorded.file, 'speech.mp3');
  assert.equal(next.assets[id].voiceSettings.text, 'It is open!');
  assert.equal(Object.keys(next.assets.hero.linkedAnimationAssets).length, 1);
  assert.equal(first.assets[id].activeVersion, 'recorded');
});

test('game catalog includes scene hotspots and inventory, and deduplicates shared characters', async () => {
  const scenes = JSON.parse(await readFile(new URL('../../../demos/forest/public/authoring/scenes.json', import.meta.url), 'utf8'));
  const rows = interactionTargets(scenes);
  assert.equal(rows.filter(row => row.id === 'prefab:forest.character.borin').length, 1);
  assert.ok(rows.find(row => row.id === 'prefab:forest.character.borin').locations.length > 1);
  assert.equal(rows.filter(row => row.kind === 'inventory-item').length, 6);
  assert.ok(rows.some(row => row.kind === 'hotspot' && row.name === 'Stew cauldron'));
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.ok(!rows.some(row => row.id === 'prefab:pointlesh.inventory-item'));
});

test('empty and red X cells inherit defaults, while explicit speech and code override them', async () => {
  const manifest = make(), calls = [];
  manifest.cells.defaults = { 'verb:talk': { kind: 'simple', text: 'Hello?' }, 'verb:push': { kind: 'code' }, 'item:rope': { kind: 'simple', text: 'No knot needed.' } };
  const handlers = { say: (...args) => calls.push(args), code: (...args) => calls.push(args) };
  await runInteraction(manifest, 'chest', 'verb:talk', handlers);
  assert.deepEqual(calls.pop(), ['Hello?', interactionVoiceLineId('defaults', 'verb:talk')]);
  await runInteraction(manifest, 'other', 'verb:push', handlers);
  assert.deepEqual(calls.pop(), ['other', 'verb:push']); // Code still receives the actual target.
  await runInteraction(manifest, 'other', 'item:rope', handlers);
  assert.equal(calls.pop()[0], 'No knot needed.');
  manifest.cells.chest['verb:talk'] = { kind: 'impossible' };
  await runInteraction(manifest, 'chest', 'verb:talk', handlers);
  assert.deepEqual(calls.pop(), ['Hello?', interactionVoiceLineId('defaults', 'verb:talk')]);
  manifest.cells.chest['verb:push'] = { kind: 'impossible' };
  await runInteraction(manifest, 'chest', 'verb:push', handlers);
  assert.deepEqual(calls.pop(), ['chest', 'verb:push'], 'red X also inherits default code with the actual target');
  manifest.cells.defaults['item:chest'] = { kind: 'impossible' };
  assert.equal(await runInteraction(manifest, 'chest', 'item:chest', handlers), false, 'default metadata is not executable');
  manifest.cells.chest['verb:talk'] = { kind: 'simple', text: 'A chest reply.' };
  await runInteraction(manifest, 'chest', 'verb:talk', handlers); assert.equal(calls.pop()[0], 'A chest reply.');
  delete manifest.cells.chest['verb:talk']; delete manifest.cells.defaults['verb:talk'];
  assert.equal(await runInteraction(manifest, 'chest', 'verb:talk', handlers), false);
});

test('random selects one sentence, rotation wraps per source cell, and sequence awaits every line', async () => {
  const manifest = make(), state = createInteractionPlaybackState(), spoken = [];
  const cell = manifest.cells.chest['verb:look'] = { kind: 'simple', sentences: ['One', 'Two', 'Three'], mode: 'random' };
  const say = text => spoken.push(text);
  for (const random of [() => 0, () => .5, () => .999]) await runInteraction(manifest, 'chest', 'verb:look', { say }, { state, random });
  assert.deepEqual(spoken.splice(0), ['One', 'Two', 'Three']);
  cell.mode = 'rotation';
  for (let i = 0; i < 5; i++) await runInteraction(manifest, 'chest', 'verb:look', { say }, { state });
  assert.deepEqual(spoken.splice(0), ['One', 'Two', 'Three', 'One', 'Two']);
  const restored = JSON.parse(JSON.stringify(state));
  await runInteraction(manifest, 'chest', 'verb:look', { say }, { state: restored }); assert.equal(spoken.pop(), 'Three');
  manifest.cells.defaults = { 'verb:talk': { ...cell, sentences: ['A', 'B'] } };
  await runInteraction(manifest, 'first', 'verb:talk', { say }, { state });
  await runInteraction(manifest, 'second', 'verb:talk', { say }, { state });
  assert.deepEqual(spoken.splice(0), ['A', 'B']);
  cell.mode = 'sequence'; let resume;
  const running = runInteraction(manifest, 'chest', 'verb:look', { say: text => { spoken.push(text); return new Promise(resolve => { resume = resolve; }); } });
  assert.deepEqual(spoken, ['One']); resume(); await Promise.resolve(); assert.deepEqual(spoken, ['One', 'Two']);
  resume(); await Promise.resolve(); assert.deepEqual(spoken, ['One', 'Two', 'Three']); resume(); await running;
  for (const invalid of [{ sentences: [] }, { sentences: [''] }, { sentences: ['ok'], mode: 'nope' }, { sentences: ['ok'], text: 'ambiguous' }]) {
    assert.throws(() => assertInteractionManifest({ ...manifest, cells: { chest: { 'verb:look': { kind: 'simple', ...invalid } } } }));
  }
});

test('each sentence and default has its own linked voice line, retaining the original first-line id', () => {
  const manifest = make();
  manifest.cells.defaults = { 'verb:look': { kind: 'simple', mode: 'sequence', sentences: ['Default first', 'Default second'] } };
  manifest.cells.chest['verb:look'] = { kind: 'simple', mode: 'rotation', sentences: ['A stubborn chest.', 'Still stubborn.'] };
  const synced = syncInteractionVoiceLines(manifest, assets()); assertManifest(synced);
  assert.equal(synced.assets[interactionVoiceLineId('chest', 'verb:look')].voiceSettings.text, 'A stubborn chest.');
  assert.equal(synced.assets[interactionVoiceLineId('chest', 'verb:look', 1)].voiceSettings.text, 'Still stubborn.');
  assert.equal(synced.assets[interactionVoiceLineId('defaults', 'verb:look', 1)].voiceSettings.text, 'Default second');
  assert.match(synced.assets.hero.linkedAnimationAssets[interactionVoiceLineId('defaults', 'verb:look', 1)].label, /Defaults.*Sentence 2/);
});


test('interactive matrix targets respect prefab and instance settings without discarding authored data', () => {
  const prefabs = [
    createCharacterPrefab({ id: 'borin', properties: { interactive: false } }),
    createObjectPrefab({ id: 'lamp', properties: { interactive: false } }),
    createObjectPrefab({ id: 'chest' }),
    createHotspotPrefab({ id: 'door', properties: { interactive: false } }),
    createInventoryItemPrefab({ id: 'rope' }),
  ];
  const first = createLayer({ id: 'first' }), second = createLayer({ id: 'second' });
  first.prefabs = ['borin', 'lamp', 'chest', 'door'].map(prefabId => createPointleshInstance({ id: prefabId, prefabId }));
  // A prefab can be decorative in one scene and interactive in another.
  second.prefabs = [createPointleshInstance({ id: 'other-borin', prefabId: 'borin', properties: { interactive: true } })];
  const scenes = defineSceneManifest({ schemaVersion: 2, prefabs: Object.fromEntries(prefabs.map(p => [p.id, p])), scenes: {
    first: { id: 'first', name: 'First', width: 320, height: 180, layers: [first] },
    second: { id: 'second', name: 'Second', width: 320, height: 180, layers: [second] },
  } });
  const manifest = make();
  manifest.cells['prefab:borin'] = { 'verb:look': { kind: 'simple', text: 'Ready for adventure.' } };
  const before = structuredClone(manifest);
  const shown = () => interactionTargets(scenes, { interactiveOnly: true });
  assert.deepEqual(shown().map(row => row.id).sort(), ['prefab:borin', 'prefab:chest', 'prefab:rope']);
  assert.deepEqual(shown().find(row => row.id === 'prefab:borin').locations.map(location => location.sceneId), ['second']);
  assert.equal(interactionTargets(scenes).length, 5, 'full catalog remains available for voice labels');
  second.prefabs[0].pointlesh.properties.interactive = false;
  assert.ok(!shown().some(row => row.id === 'prefab:borin'));
  scenes.prefabs.borin.pointlesh.properties.interactive = true;
  assert.deepEqual(shown().find(row => row.id === 'prefab:borin').locations.map(location => location.sceneId), ['first']);
  first.prefabs.find(p => p.prefabId === 'chest').pointlesh = { properties: { interactive: false } };
  assert.ok(!shown().some(row => row.id === 'prefab:chest'));
  scenes.prefabs.door.pointlesh.properties.interactive = true;
  assert.ok(shown().some(row => row.id === 'prefab:door'));
  assert.deepEqual(manifest, before);
  const synced = syncInteractionVoiceLines(manifest, assets(), interactionTargets(scenes));
  assert.equal(synced.assets[interactionVoiceLineId('prefab:borin', 'verb:look')].voiceSettings.text, 'Ready for adventure.');
});
