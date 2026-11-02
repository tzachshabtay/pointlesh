import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('a promoted voice recovers from a decode failure without reloading the game', async ({ page }) => {
  await page.route('**/__audio_check__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Audio test</body></html>' }));
  const recording = readFileSync('demos/forest/public/art/line.elder.greeting.promoted-1793324837849-1.mp3');
  const requests: string[] = [];
  await page.route('**/new-voice.mp3*', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'audio/mpeg', body: requests.length === 1 ? Buffer.from('invalid audio response') : recording });
  });
  await page.goto('/__audio_check__');
  await page.addScriptTag({ path: 'node_modules/phaser/dist/phaser.js' });
  const result = await page.evaluate(async moduleUrl => {
    const { PhaserAdventureAudioAssets } = await import(moduleUrl);
    const Phaser = (window as any).Phaser;
    return await new Promise<{ cached: boolean; duration: number; sameKey: boolean }>((resolve, reject) => {
      const line = { id: 'new-voice', kind: 'voice-line', activeVersion: '', versions: {} };
      new Phaser.Game({ type: Phaser.HEADLESS, width: 1, height: 1, banner: false, scene: {
        async create() {
          const scene = this as any;
          const runtime = { manifest: { assets: { [line.id]: line } }, key: () => 'unrecorded' };
          const audio = new PhaserAdventureAudioAssets(scene, runtime, location.origin);
          try {
            const saved = { assets: { [line.id]: { ...line, activeVersion: 'take', versions: { take: { file: 'new-voice.mp3' } } } } };
            await audio.syncManifest(saved);
            const key = audio.key(line.id), buffer = scene.cache.audio.get(key);
            await audio.syncManifest(saved);
            resolve({ cached: Boolean(buffer), duration: buffer?.duration ?? 0, sameKey: audio.key(line.id) === key });
          } catch (error) { reject(error); }
          finally { audio.destroy(); scene.game.destroy(true); }
        },
      } });
    });
  }, `/@fs/${resolve('packages/phaser/dist/audio-assets.js')}`);
  expect(result.cached).toBe(true);
  expect(result.duration).toBeGreaterThan(1);
  expect(result.sameKey).toBe(true);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toContain('_pointlesh_audio_retry=');
});
