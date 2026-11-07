/** Regenerate only the lines changed by the story-dialog expansion, then promote each take. */
import { readFile } from 'node:fs/promises';
import { AiAssetDebugClient, regenerateAndPromoteVoiceLines } from '@ai-game-assets/phaser';
import { dialogOptionVoiceLineId } from '@dialog-designer/core';
import type { AiAssetManifest } from '@ai-game-assets/core';

const source = new URL('../public/authoring/assets.json', import.meta.url);
const groups: [string, string[]][] = [
  ['voice.borin', [
    dialogOptionVoiceLineId('elder', 'topics', 'father'),
    dialogOptionVoiceLineId('innkeeper', 'topics', 'king-tab'),
    dialogOptionVoiceLineId('miner', 'topics', 'pickaxe'),
    dialogOptionVoiceLineId('miner', 'topics', 'goodbye'),
  ]],
  ['voice.elder', ['line.elder.father']],
  ['voice.innkeeper', ['line.innkeeper.king-tab']],
  ['voice.miner', [
    'line.miner.chest-open', 'line.miner.pickaxe-taken', 'line.miner.pickaxe', 'line.miner.goodbye',
  ]],
  ['voice.chest', ['line.chest-open.guess']],
];
const client = new AiAssetDebugClient('http://127.0.0.1:4287');
for (const [voiceAssetId, ids] of groups) {
  const manifest = JSON.parse(await readFile(source, 'utf8')) as AiAssetManifest;
  const voice = manifest.assets[voiceAssetId];
  if (voice?.kind !== 'voice') throw new Error(`Missing voice ${voiceAssetId}`);
  for (const id of ids) {
    if (manifest.assets[id]?.kind !== 'voice-line') throw new Error(`Missing voice line ${id}`);
  }
  // The batch helper normally follows every linked line. Limit this run to the
  // new/revised script so existing user recordings remain untouched.
  voice.linkedAnimationAssets = Object.fromEntries(ids.map(id => [id,
    voice.linkedAnimationAssets?.[id] ?? { assetId: id, label: id }]));
  const result = await regenerateAndPromoteVoiceLines({ manifest, voiceAssetId, client, scope: 'all',
    onProgress: progress => console.log(`${voiceAssetId} ${progress.index + 1}/${progress.total} ${progress.phase}: ${progress.assetId}`) });
  for (const failure of result.failures) console.error(`${failure.assetId}: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`);
  if (result.manifestModuleSyncError) console.error(`Manifest sync: ${result.manifestModuleSyncError}`);
  if (result.failures.length || result.cancelled || result.manifestModuleSyncError || result.promoted.length !== ids.length) {
    throw new Error(`Promoted ${result.promoted.length}/${ids.length} ${voiceAssetId} lines; stopping before the next voice.`);
  }
}
console.log('All new and revised story-dialog voice lines promoted.');
