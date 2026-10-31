import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openAdventure } from './start-helpers';

test('voice asset lines can be found by sentence and selected from the search dropdown', async ({ page }, testInfo) => {
  const manifest = JSON.parse(readFileSync('demos/forest/public/authoring/assets.json', 'utf8'));
  const id = 'line.elder.greeting', line = manifest.assets[id];
  const sentence = line.versions[line.activeVersion]?.voiceSettings?.text ?? line.voiceSettings.text;
  await openAdventure(page, true);
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  const panel = page.locator('.ai-game-assets-designer__panel');
  await panel.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Voices$/ }).click();
  await panel.getByRole('button', { name: 'Voice Elder', exact: true }).click();
  await panel.getByRole('button', { name: 'Voice line', exact: true }).click();
  const search = panel.getByRole('combobox', { name: 'Search voice line' });
  await search.fill(sentence.slice(0, 24).toUpperCase());
  await expect(panel.getByRole('option', { name: sentence, exact: true })).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath('voice-line-search.png') });
  await panel.getByRole('option', { name: sentence, exact: true }).click();
  await expect(panel.locator('.ai-game-assets-designer__animation-select')).toHaveValue(id);
  await expect(panel.getByRole('button', { name: 'Voice line', exact: true })).toContainText(sentence);
  await panel.getByRole('button', { name: 'Voice line', exact: true }).click();
  await search.fill('no matching sentence xyz');
  await expect(panel.getByText('No matching lines.', { exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(panel.locator('.ai-game-assets-designer__animation-select')).toHaveValue(id);
});
