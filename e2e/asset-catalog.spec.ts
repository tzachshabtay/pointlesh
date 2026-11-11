import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('background art has one folder and lip sync is available only on portrait bases', async ({ page }) => {
  test.setTimeout(120_000);
  await openAdventure(page, true);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.getByRole('button', { name: /Graphics$/ }).click();
  const folders = page.locator('.ai-game-assets-designer__asset-folder');
  await expect(folders.filter({ hasText: /^Background$/ })).toHaveCount(0);
  await expect(folders.filter({ hasText: /^Backgrounds$/ })).toHaveCount(1);
  await folders.filter({ hasText: /^Backgrounds$/ }).click();
  const items = page.locator('.ai-game-assets-designer__asset-item');
  await expect(items.filter({ hasText: /^Background House Forest$/ })).toHaveCount(0);
  await items.filter({ hasText: /^Background Camp$/ }).click();
  const lipSync = page.getByRole('button', { name: 'Lip sync…', exact: true });
  await expect(lipSync).toBeHidden();
  await page.locator('.ai-game-assets-designer__asset-breadcrumb').filter({ hasText: /^Graphics$/ }).click();
  await folders.filter({ hasText: /^Portraits$/ }).click();
  await items.filter({ hasText: /^Portrait Borin$/ }).click();
  await expect(lipSync).toBeVisible();
  await page.locator('.ai-game-assets-designer__asset-breadcrumb').filter({ hasText: /^Graphics$/ }).click();
  await folders.filter({ hasText: /^Characters$/ }).click();
  await items.filter({ hasText: /^Borin$/ }).click();
  await expect(lipSync).toBeHidden();
});
