/** Run with: node --import tsx demos/forest/scripts/generate-audio.ts [asset-id ...]
 * Uses the existing ai-assets audio provider and project .env; never prints keys.
 * Existing files are preserved, so interrupted generation can safely resume.
 */
import { loadEnvFile } from 'node:process';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElevenLabsAudioProvider } from '@ai-game-assets/dev';
import { forestAudio } from '../src/audio-assets.ts';
const root = new URL('../', import.meta.url);
loadEnvFile(fileURLToPath(new URL('.env', root)));
const provider = createElevenLabsAudioProvider({ maxConcurrentMusicRequests: 1 });
const selected = process.argv.slice(2);
const queue = Object.values(forestAudio).filter(asset => !selected.length || selected.includes(asset.id));
await mkdir(new URL('public/art/audio/', root), { recursive: true });
let failed = false;
// Two workers: music requests are additionally serialized by the provider.
async function worker() {
  while (queue.length) {
    const asset = queue.shift()!;
    const path = new URL(`public/${asset.versions.original!.file}`, root);
    try { await access(path); console.log(`Kept ${asset.id}`); continue; } catch { /* Generate missing files. */ }
    console.log(`Generating ${asset.id}`);
    try {
      const [result] = await provider.generate({ asset, count: 1 });
      if (!result?.image?.length) throw new Error('Empty audio response');
      await writeFile(path, result.image);
      console.log(`Saved ${asset.id} (${result.image.length} bytes)`);
    } catch (error) { failed = true; console.error(`${asset.id}: ${error instanceof Error ? error.message : 'Generation failed'}`); }
  }
}
await Promise.all([worker(), worker()]);
if (failed) process.exitCode = 1;
