import { expect, type Page } from '@playwright/test';

/** Start through the real menu. Designer tests explicitly skip the intro and open the editor. */
export async function openAdventure(page: Page, designer = false) {
  await page.goto(designer ? '/?designer=1' : '/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeHidden();
  if (designer) {
    await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
    await page.getByRole('button', { name: 'Designer', exact: true }).click();
  }
}
