import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../demos/forest/public/authoring/assets.json', import.meta.url), 'utf8'));
const currentFile = (id: string) => { const asset = catalog.assets[id]; return asset.versions[asset.activeVersion].file; };

async function openAssets(page: Page) {
  // Authoring services are optional for viewing existing files and playing.
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
}

async function actor(page: Page) {
  return page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    return { ...scene.character.state.position, activity: scene.character.state.activity,
      frame: scene.actor.frame.name };
  });
}

test('Current loads character images and animation sheets from the game server with authoring offline', async ({ page }) => {
  await openAssets(page);
  await page.getByRole('button', { name: /Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
  const current = page.locator('.ai-game-assets-designer__current-image');
  for (const name of ['Elder', 'Borin', 'Guard']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(current).toBeVisible();
    await expect(current).toHaveAttribute('src', new URL(currentFile(name.toLowerCase()), page.url()).href);
    await expect.poll(() => current.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('guard.walk-front');
  await expect(current).toHaveAttribute('src', /characters\/guard\/walk-front\.png$/);
  await expect.poll(() => current.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('Assets leaves animation, click walking and keyboard walking live while text inputs stay isolated', async ({ page }) => {
  await openAssets(page);
  const before = await actor(page);
  await expect.poll(async () => (await actor(page)).frame).not.toBe(before.frame);
  const target = await page.evaluate(() => {
    const camera = (window as any).pointleshDemo.scene.cameras.main;
    const canvas = document.querySelector('#game canvas')!.getBoundingClientRect();
    return { x: canvas.left + ((260 - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2) * canvas.width / camera.width,
      y: canvas.top + ((465 - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2) * canvas.height / camera.height };
  });
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await actor(page)).activity).toBe('walking');
  const walking = await actor(page);
  await expect.poll(async () => (await actor(page)).frame).not.toBe(walking.frame);
  await expect.poll(async () => (await actor(page)).x).toBeLessThan(before.x - 40);
  await expect.poll(async () => (await actor(page)).activity).toBe('idle');

  const stopped = await actor(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await actor(page)).x).toBeGreaterThan(stopped.x + 20);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await actor(page)).activity).toBe('idle');

  const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
  await prompt.focus();
  const typing = await actor(page);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowLeft');
  expect((await actor(page)).x).toBeCloseTo(typing.x, 3);

  // The floating panel covers the hint button; trigger speech to check its animation.
  await page.evaluate(() => (window as any).pointleshDemo.scene.say('The king is counting on us.'));
  await expect.poll(async () => (await actor(page)).activity).toBe('speaking');
  const speaking = await actor(page);
  await expect.poll(async () => (await actor(page)).frame).not.toBe(speaking.frame);
  await expect(page.getByRole('button', { name: 'Toggle AI asset designer', exact: true })).toHaveAttribute('aria-expanded', 'true');
});
