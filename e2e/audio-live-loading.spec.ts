import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

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


test('a newly saved recording plays on its first request before the preview watcher catches up', async ({ page }) => {
  await page.route('**/__audio_check__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Audio test</body></html>' }));
  await page.goto('/__audio_check__');
  await page.addScriptTag({ path: 'node_modules/phaser/dist/phaser.js' });
  await page.evaluate(() => new Promise<void>(resolve => {
    const Phaser = (window as any).Phaser;
    new Phaser.Game({ type: Phaser.HEADLESS, width: 1, height: 1, banner: false, scene: {
      create() { (window as any).audioTestScene = this; resolve(); },
    } });
  }));
  const file = `art/audio-publication-test-${randomUUID()}.mp3`;
  const destination = `demos/forest/public/${file}`;
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (request.url().includes(file)) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await writeFile(destination, readFileSync('demos/forest/public/art/line.elder.greeting.promoted-1793324837849-1.mp3'));
    const duration = await page.evaluate(async ({ moduleUrl, file }) => {
      const { PhaserAdventureAudioAssets } = await import(moduleUrl);
      const scene = (window as any).audioTestScene;
      const line = { id: 'new-voice', kind: 'voice-line', activeVersion: 'take', versions: { take: { file } } };
      const audio = new PhaserAdventureAudioAssets(scene, { manifest: { assets: {} }, key: () => 'unrecorded' }, location.origin);
      try {
        // Match the asset designer's onAssetReady + onManifestUpdated callbacks.
        await Promise.all([
          audio.select(line.id, new URL(file, location.href).href, line),
          audio.syncManifest({ assets: { [line.id]: line } }),
        ]);
        return scene.cache.audio.get(audio.key(line.id)).duration;
      } finally { audio.destroy(); scene.game.destroy(true); }
    }, { moduleUrl: `/@fs/${resolve('packages/phaser/dist/audio-assets.js')}`, file });
    expect(duration).toBeGreaterThan(1);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { await unlink(destination); }
});
