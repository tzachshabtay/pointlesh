import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openAdventure } from './start-helpers';

test('selected unpromoted voice text is shown with its recording in normal speech and dialogs', async ({ page }) => {
  const catalog = JSON.parse(readFileSync('demos/forest/public/authoring/assets.json', 'utf8'));
  const id = 'line.elder.greeting', text = 'This is the newly selected sentence.';
  const dataUrl = `data:audio/mpeg;base64,${readFileSync('demos/forest/public/art/audio/sfx.pickup.mp3').toString('base64')}`;
  const original = catalog.assets[id];
  const oldText = original.versions[original.activeVersion]?.voiceSettings?.text ?? original.voiceSettings.text;
  await page.route('http://127.0.0.1:4287/**', async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/manifest')) return route.fulfill({ headers, json: catalog });
    if (path.endsWith('/generate-stream')) return route.fulfill({ headers, contentType: 'application/x-ndjson', body: [
      { type: 'option', option: { index: 0, dataUrl, mimeType: 'audio/mpeg', model: 'test', prompt: 'Gently', voiceSettings: { ...original.voiceSettings, text }, durationSeconds: .7 } }, { type: 'done' }
    ].map(x => JSON.stringify(x)).join('\n') + '\n' });
    return route.abort();
  });
  await openAdventure(page, true);
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  const panel = page.locator('.ai-game-assets-designer__panel');
  await panel.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Voices$/ }).click();
  await panel.getByRole('button', { name: 'Voice Elder', exact: true }).click();
  await panel.getByRole('button', { name: 'Voice line', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Search voice line' }).fill(oldText);
  await panel.getByRole('option', { name: oldText, exact: true }).click();
  await panel.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await panel.getByRole('button', { name: 'Select option 1', exact: true }).click();
  await expect.poll(() => page.evaluate(id => (window as any).pointleshDemo.scene.audioAssets.voiceText(id, ''), id)).toBe(text);
  await page.evaluate(({ id, oldText }) => (window as any).pointleshDemo.scene.say(oldText, 'Elder Rowan', id), { id, oldText });
  await expect(page.locator('#speech')).toHaveText(text);
  await page.evaluate(({ id, oldText }) => {
    const scene = (window as any).pointleshDemo.scene;
    scene.renderTurn({ type: 'line', resolved: { text: oldText, lineAsset: { id }, voiceAsset: { id: 'voice.elder' } } });
  }, { id, oldText });
  await expect(page.locator('#speech')).toHaveText(text);
});
