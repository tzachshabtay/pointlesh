import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../demos/forest/public/authoring/assets.json', import.meta.url), 'utf8'));

test('choosing an animation reference sends its source grid with the guard generation request', async ({ page }) => {
  let generation: any;
  // Inspect the real designer request without running paid generation or saving assets.
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      } });
    } else if (route.request().url().endsWith('/generate-stream')) {
      generation = route.request().postDataJSON();
      await route.fulfill({ contentType: 'application/x-ndjson', headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ type: 'done' }) + '\n' });
    } else await route.abort();
  });
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  const panel = page.locator('.ai-game-assets-designer__panel');
  await panel.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Graphics$/ }).click();
  await panel.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
  await panel.getByRole('button', { name: 'Guard', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('guard.walk-left');
  await panel.getByRole('button', { name: 'Add reference', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a generation reference', exact: true });
  await picker.getByRole('button', { name: 'Existing asset', exact: true }).click();
  await picker.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Graphics$/ }).click();
  await picker.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
  await picker.getByRole('button', { name: 'Guard Idle Front', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(panel.getByRole('group', { name: 'Generation reference' })).toContainText('Guard Idle Front');
  await panel.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect.poll(() => generation?.assetId).toBe('guard.walk-left');
  expect(generation.count).toBe(3);
  expect(generation.priorityReference.frameGrid).toEqual(catalog.assets['guard.idle-front'].frameGrid);
  const source = catalog.assets['guard.idle-front'];
  const image = readFileSync(new URL(`../demos/forest/public/${source.versions[source.activeVersion].file}`, import.meta.url));
  expect(generation.priorityReference.dataUrl).toBe(`data:image/png;base64,${image.toString('base64')}`);
});
