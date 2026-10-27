import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('illustrated map follows the exits and travels without resetting the story', async ({ page }) => {
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !(window as any).pointleshDemo.scene.blocked(false))).toBe(true);
  await page.keyboard.press('m');
  const map = page.getByRole('navigation', { name: 'Map of the Elderwood' });
  await expect(map).toBeVisible();
  await expect(map.getByRole('button')).toHaveCount(6);
  const bounds = async (id: string) => (await map.locator(`[data-room="${id}"]`).boundingBox())!;
  const camp = await bounds('camp'), mine = await bounds('mine'), forest = await bounds('forest');
  const village = await bounds('village'), pub = await bounds('pub'), house = await bounds('house');
  expect(camp.x).toBeGreaterThan(forest.x); expect(camp.y).toBeLessThan(forest.y);
  expect(mine.x).toBeLessThan(forest.x); expect(mine.y).toBeLessThan(forest.y);
  expect(village.y).toBeGreaterThan(forest.y);
  expect(pub.x).toBeLessThan(village.x); expect(house.x).toBeGreaterThan(village.x);
  await expect(map.locator('[data-room="village"]')).toHaveAttribute('aria-current', 'location');
  const before = await page.evaluate(() => {
    const story = (window as any).pointleshDemo.scene.story;
    return { inventory: story.inventory, flags: story.flags, journal: story.journal };
  });
  for (const [id, name] of [['pub', 'The Copper Tankard'], ['house', 'Borin’s Cottage'], ['mine', 'The Goldroot Mine'], ['forest', 'The Whispering Wood'], ['camp', 'The Orc Encampment'], ['village', 'Bramblehollow']]) {
    await map.locator(`[data-room="${id}"]`).click();
    await expect(page.locator('#modal-backdrop')).toBeHidden();
    await expect(page.locator('#room-name')).toHaveText(name!);
    await expect.poll(() => page.evaluate(() => !(window as any).pointleshDemo.scene.blocked(false))).toBe(true);
    await page.keyboard.press('m');
    await expect(map.locator(`[data-room="${id}"]`)).toHaveAttribute('aria-current', 'location');
  }
  const after = await page.evaluate(() => {
    const story = (window as any).pointleshDemo.scene.story;
    return { inventory: story.inventory, journal: story.journal };
  });
  expect(after).toEqual({ inventory: before.inventory, journal: before.journal });
  await map.getByRole('button', { name: 'The Copper Tankard', exact: true }).press('Enter');
  await expect(page.locator('#room-name')).toHaveText('The Copper Tankard');
  await page.keyboard.press('j');
  await expect(page.getByRole('dialog')).not.toHaveClass(/world-map-modal/);
});
