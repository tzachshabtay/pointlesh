import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInteractionDevServer } from '../dist/index.js';
import { interactionVoiceLineId } from '@pointlesh/core';

test('promoting interactions persists speech alongside the latest generated assets and rejects invalid writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pointlesh-interactions-'));
  const manifestPath = join(dir, 'interactions.json'), aiAssetsManifestPath = join(dir, 'assets.json');
  const initial = { schemaVersion: 1, heroVoiceAssetId: 'hero', verbs: [{ id: 'look', label: 'Look' }], cells: {} };
  const assetManifest = { schemaVersion: 1, assets: { hero: { id: 'hero', kind: 'voice', prompt: 'Hero', activeVersion: '', versions: {} },
    art: { id: 'art', kind: 'image', dimensions: { width: 16, height: 16 }, prompt: 'Preserve this generation', activeVersion: 'generated', versions: { generated: { name: 'generated', file: 'precious.png', prompt: 'Art', model: 'test', createdAt: '2026-10-03T00:00:00Z' } } } } };
  await writeFile(manifestPath, JSON.stringify(initial)); await writeFile(aiAssetsManifestPath, JSON.stringify(assetManifest));
  const service = createInteractionDevServer({ manifestPath, aiAssetsManifestPath, port: 0 });
  try {
    const address = await service.listen(), url = `http://127.0.0.1:${address.port}/manifest`;
    const updated = { ...initial, cells: { chest: { 'verb:look': { kind: 'simple', text: 'Golden runes.' } }, defaults: { 'verb:look': { kind: 'simple', mode: 'rotation', sentences: ['Nothing unusual.', 'Still nothing unusual.'] } } } };
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5186' }, body: JSON.stringify(updated) });
    const responseText = await response.text(); assert.equal(response.status, 200, responseText); assert.deepEqual(JSON.parse(responseText), updated);
    const saved = JSON.parse(await readFile(aiAssetsManifestPath, 'utf8'));
    assert.deepEqual(saved.assets.art, assetManifest.assets.art);
    const id = interactionVoiceLineId('chest', 'verb:look'); assert.equal(saved.assets[id].voiceSettings.text, 'Golden runes.');
    assert.equal(saved.assets.hero.linkedAnimationAssets[id].assetId, id);
    assert.equal(saved.assets[interactionVoiceLineId('defaults', 'verb:look', 1)].voiceSettings.text, 'Still nothing unusual.');
    assert.deepEqual(await (await fetch(url)).json(), updated);
    saved.assets[id].voiceSettings.text = 'A revised line from the recording session.';
    await writeFile(aiAssetsManifestPath, JSON.stringify(saved));
    const reloaded = await (await fetch(url)).json();
    assert.equal(reloaded.cells.chest['verb:look'].text, 'A revised line from the recording session.');
    assert.equal(reloaded.cells.defaults['verb:look'].mode, 'rotation');
    saved.assets[id].activeVersion = 'recorded';
    saved.assets[id].versions.recorded = { name: 'recorded', file: 'take.mp3', prompt: saved.assets[id].voiceSettings.text,
      model: 'microphone', createdAt: '2026-10-30T00:00:00Z', voiceSettings: { ...saved.assets[id].voiceSettings } };
    await writeFile(aiAssetsManifestPath, JSON.stringify(saved));
    const changed = structuredClone(updated);
    changed.cells.chest['verb:look'].text = 'A freshly deciphered inscription.';
    const promoted = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed) });
    assert.equal(promoted.status, 200, await promoted.text());
    const afterEdit = JSON.parse(await readFile(aiAssetsManifestPath, 'utf8'));
    assert.equal(afterEdit.assets[id].activeVersion, 'recorded');
    assert.equal(afterEdit.assets[id].versions.recorded.voiceSettings.text, 'A freshly deciphered inscription.');
    assert.equal(afterEdit.assets[id].versions.recorded.recordedText, 'A revised line from the recording session.');
    assert.equal(afterEdit.assets[id].voiceSettings.text, 'A freshly deciphered inscription.');
    const invalid = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...updated, verbs: [] }) });
    assert.equal(invalid.status, 400); assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), changed);
    assert.equal((await fetch(url, { method: 'PUT', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify(initial) })).status, 403);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});
