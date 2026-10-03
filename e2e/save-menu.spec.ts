import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
});

for (const width of [1440, 390]) test(`in-game menu and persistent save screenshots work at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto('/');
  await expect(page.locator('#new-game')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.locator('#new-game').click();
  await page.locator('#skip-intro').click();
  await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene;
    s.changeRoom('house'); s.character.stop(); s.story.inventory = ['rope']; s.render();
  });
  await expect(page.locator('.game-tools #save, .game-tools #load')).toHaveCount(0);
  await page.locator('#menu').click();
  await expect(page.getByRole('button', { name: 'Resume adventure', exact: true })).toBeVisible();
  const checkpoint = () => page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene;
    return { started: s.started, position: s.character.snapshot().position, room: s.story.roomId };
  });
  const before = await checkpoint();
  await page.waitForTimeout(250);
  expect(await checkpoint()).toEqual(before);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'save slot 1', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'save slot 1', exact: true }).click();
  await expect(page.locator('#modal-backdrop')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Adventure saved in slot 1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pointlesh:pointlesh-king-under-mountain:1')!));
  expect(saved.state.roomId).toBe('house');
  expect(saved.screenshot).toMatch(/^data:image\/jpeg;base64,/);
  expect(saved.screenshot.length).toBeLessThan(100_000);

  await page.locator('#menu').click();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  const preview = page.getByRole('img', { name: 'Saved game in slot 1', exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  expect(await preview.getAttribute('src')).toBe(saved.screenshot);
  await expect(page.getByRole('button', { name: 'load slot 3', exact: true })).toBeDisabled();
  expect(await page.getByRole('dialog').evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('save-screenshots.png') });
  await page.getByRole('button', { name: '← Back to menu', exact: true }).click();
  await page.getByRole('button', { name: 'Resume adventure', exact: true }).click();
  await expect(page.locator('#modal-backdrop')).toBeHidden();
  expect(await checkpoint()).toEqual(before);

  await page.reload();
  await expect(page.locator('#new-game')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.locator('#start-load').click();
  await expect(preview).toBeVisible();
  expect(await preview.getAttribute('src')).toBe(saved.screenshot);
  await page.getByRole('button', { name: 'load slot 1', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeHidden();
  expect((await checkpoint()).room).toBe('house');
  await expect(page.getByRole('button', { name: 'Climbing rope', exact: true })).toBeVisible();
});

test('legacy saves load without thumbnails and overwriting replaces the preview with the new room', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#new-game')).toBeEnabled();
  await page.locator('#new-game').click(); await page.locator('#skip-intro').click();
  await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene;
    s.changeRoom('house'); s.character.stop(); s.saves.save('1', s.snapshot());
  });
  await page.locator('#menu').click(); await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('No preview yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'load slot 1', exact: true }).click();
  await expect(page.locator('#room-name')).toHaveText('Borin’s Cottage');
  const save = async () => {
    await page.locator('#menu').click(); await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'save slot 1', exact: true }).click();
    await expect(page.locator('#modal-backdrop')).toBeHidden();
    return page.evaluate(() => JSON.parse(localStorage.getItem('pointlesh:pointlesh-king-under-mountain:1')!));
  };
  const cottage = await save();
  await page.evaluate(() => { const s = (window as any).pointleshDemo.scene; s.changeRoom('pub'); s.character.stop(); });
  const pub = await save();
  expect(pub.state.roomId).toBe('pub'); expect(pub.screenshot).not.toBe(cottage.screenshot);
  await page.locator('#menu').click(); await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Saved game in slot 1', exact: true })).toHaveAttribute('src', pub.screenshot);
});
