import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openAdventure } from './start-helpers';

test('auditioned and promoted door audio reaches game playback without losing runtime assets', async ({ page }) => {
  const catalog = JSON.parse(readFileSync('demos/forest/public/authoring/assets.json', 'utf8'));
  // Use a different existing recording; no paid generation or actual authoring writes.
  const dataUrl = `data:audio/mpeg;base64,${readFileSync('demos/forest/public/art/audio/sfx.pickup.mp3').toString('base64')}`;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:4287/**', async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/manifest')) return route.fulfill({ headers, json: catalog });
    if (path.endsWith('/generate-stream')) return route.fulfill({ headers, contentType: 'application/x-ndjson', body: [
      { type: 'option', option: { index: 0, dataUrl, mimeType: 'audio/mpeg', model: 'test', prompt: 'test door', durationSeconds: .7 } }, { type: 'done' },
    ].map(x => JSON.stringify(x)).join('\n') + '\n' });
    if (path.endsWith('/save')) {
      const requestData = request.postDataJSON();
      const manifest = structuredClone(catalog), asset = manifest.assets['sfx.door-close'];
      delete manifest.assets['journal.quill']; delete manifest.assets['journal.quill.write'];
      asset.activeVersion = requestData.versionName;
      asset.versions[asset.activeVersion] = { ...asset.versions.original, name: asset.activeVersion, file: dataUrl };
      return route.fulfill({ headers, json: { manifest, asset, versionName: asset.activeVersion, file: dataUrl } });
    }
    return route.abort();
  });
  await openAdventure(page, true);
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  const panel = page.locator('.ai-game-assets-designer__panel');
  await panel.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Audio$/ }).click();
  await panel.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^SFX$/ }).click();
  await panel.getByRole('button', { name: 'Sfx Door Close', exact: true }).click();
  await panel.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await panel.getByRole('button', { name: 'Select option 1', exact: true }).click();
  const selectedKey = () => page.evaluate(() => (window as any).pointleshDemo.scene.audioAssets.key('sfx.door-close'));
  await expect.poll(selectedKey).toMatch(/^pointlesh-audio::sfx.door-close::/);
  const checkPlayback = () => page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const sound = scene.audio.playSfx('door-close');
    const result = { key: sound?.key, playing: sound?.isPlaying, duration: sound?.totalDuration };
    sound?.destroy(); return result;
  });
  const preview = await checkPlayback();
  expect(preview.playing).toBe(true); expect(preview.duration).toBeLessThan(.9);
  await panel.getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Promoted sfx.door-close to');
  await expect.poll(() => page.evaluate(() => !!(window as any).pointleshDemo.scene.aiRuntime.manifest.assets['journal.quill'])).toBe(true);
  expect((await checkPlayback()).playing).toBe(true);
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  // Real frame updates after promotion used to throw and strand the busy cursor.
  const before = await page.evaluate(() => (window as any).pointleshDemo.scene.time.now);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.time.now)).toBeGreaterThan(before + 200);
  expect(errors).toEqual([]);
});
