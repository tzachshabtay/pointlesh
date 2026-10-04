import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';
import { assertInteractionManifest, interactionTargets, interactionVoiceLineId, runInteraction, syncInteractionVoiceLines } from '../dist/index.js';

const make = () => ({ schemaVersion: 1, heroVoiceAssetId: 'hero', verbs: [{ id: 'look', label: 'Look' }, { id: 'push', label: 'Push' }, { id: 'talk', label: 'Talk' }],
  cells: { chest: { 'verb:look': { kind: 'simple', text: 'A stubborn chest.' }, 'verb:push': { kind: 'code' }, 'item:chest': { kind: 'impossible' } } } });
const assets = () => ({ schemaVersion: 1, assets: { hero: { id: 'hero', kind: 'voice', prompt: 'The hero', activeVersion: '', versions: {} } } });

test('all interaction states dispatch distinctly, with arbitrary verbs and inventory columns', async () => {
  const manifest = make(); assertInteractionManifest(manifest); const calls = [];
  const handlers = { say: (...args) => calls.push(['speech', ...args]), code: (...args) => calls.push(['code', ...args]), impossible: (...args) => calls.push(['impossible', ...args]) };
  assert.equal(await runInteraction(manifest, 'chest', 'verb:talk', handlers), false);
  assert.equal(await runInteraction(manifest, 'chest', 'verb:look', handlers), true);
  assert.equal(await runInteraction(manifest, 'chest', 'verb:push', handlers), true);
  assert.equal(await runInteraction(manifest, 'chest', 'item:chest', handlers), true);
  assert.deepEqual(calls, [['speech', 'A stubborn chest.', interactionVoiceLineId('chest', 'verb:look')], ['code', 'chest', 'verb:push'], ['impossible', 'chest', 'item:chest']]);
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
