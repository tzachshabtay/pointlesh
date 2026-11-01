import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openAdventure } from './start-helpers';

test('dialog designer creates and edits a voice line before publishing references to the game', async ({ page }, testInfo) => {
  let assets = JSON.parse(readFileSync('demos/forest/public/authoring/assets.json', 'utf8'));
  const dialogs = JSON.parse(readFileSync('demos/forest/public/authoring/dialogs.json', 'utf8'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let createdId = '', savedText = '';
  await page.route('http://127.0.0.1:4289/**', async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/manifest')) return route.fulfill({ headers, json: dialogs });
    if (path.endsWith('/voice-line')) {
      const input = req.postDataJSON();
      createdId = input.assetId;
      const asset = { id: createdId, kind: 'voice-line', prompt: input.direction || 'Natural conversational delivery.', voiceSettings: { voiceAssetId: input.voiceAssetId, text: input.text, direction: input.direction ?? '' }, activeVersion: '', versions: {} };
      assets.assets[createdId] = asset;
      return route.fulfill({ headers, json: { aiAssets: assets, asset, lineAssetId: createdId } });
    }
    if (path.endsWith('/update-voice-line')) {
      const input = req.postDataJSON(); savedText = input.text;
      assets.assets[input.assetId].voiceSettings = { ...assets.assets[input.assetId].voiceSettings, text: input.text, direction: input.direction };
      return route.fulfill({ headers, json: { aiAssets: assets } });
    }
    return route.abort();
  });
  await openAdventure(page, true);
  await page.getByRole('button', { name: 'Toggle dialog designer', exact: true }).click();
  const panel = page.locator('.dialog-designer__panel');
  await panel.getByRole('combobox', { name: 'Selected dialog' }).selectOption('elder');
  await panel.locator('.dialog-designer__node-select').filter({ hasText: 'Greeting' }).click();
  await panel.getByText('Create a new voice line', { exact: true }).click();
  const create = panel.locator('.dialog-designer__create-card');
  await create.locator('select').selectOption('voice.borin');
  await create.getByLabel('Text', { exact: true }).fill('What will they do with him?');
  await create.getByRole('button', { name: 'Create and add line' }).click();
  await expect(panel.locator('.dialog-designer__status')).toContainText('Created voice line');
  const card = panel.locator('.dialog-designer__line-card').filter({ hasText: 'What will they do with him?' });
  await card.getByRole('button', { name: 'Edit voice line text and director notes' }).click();
  await card.getByLabel('Spoken text').fill('We need to bring him home.');
  await card.getByLabel('Director notes').fill('Quiet determination');
  await panel.screenshot({ path: testInfo.outputPath('dialog-voice-edit.png') });
  await card.getByRole('button', { name: 'Save text', exact: true }).click();
  await expect(panel.locator('.dialog-designer__status')).toHaveText('Voice line text saved.');
  expect(savedText).toBe('We need to bring him home.');
  await page.evaluate(id => (window as any).pointleshDemo.scene.say('Original fallback', 'Borin', id), createdId);
  await expect(page.locator('#speech')).toHaveText('We need to bring him home.');
  expect(errors).toEqual([]);
});
