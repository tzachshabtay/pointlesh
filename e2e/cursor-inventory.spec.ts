import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  // The short intro can already have ended on a slow or suspended test machine.
  await page.locator('#skip-intro').evaluate((button: HTMLButtonElement) => button.click());
  // Record frames in the page so a short click animation cannot finish between
  // Playwright commands on a busy machine.
  await page.evaluate(() => {
    (window as any).cursorFeedback = [];
    (window as any).pointleshDemo.scene.events.on('postupdate', () => {
      const cursor = document.querySelector<HTMLElement>('.pointlesh-adventure-cursor');
      if (cursor?.dataset.state === 'click' && Number(cursor.dataset.frame) > 0) (window as any).cursorFeedback.push(cursor.dataset.assetId);
    });
  });
}
const clearFeedback = (page: Page) => page.evaluate(() => { (window as any).cursorFeedback = []; });
const expectFeedback = (page: Page, asset: string) => expect.poll(() => page.evaluate(() => (window as any).cursorFeedback)).toContain(asset);
async function worldPoint(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const scene = (window as any).pointleshDemo.scene, rect = scene.game.canvas.getBoundingClientRect();
    const view = scene.cameras.main.matrix.transformPoint(x, y);
    return { x: rect.left + view.x * rect.width / scene.cameras.main.width, y: rect.top + view.y * rect.height / scene.cameras.main.height };
  }, { x, y });
}

test('walk and interact cursors switch, animate on click, and keep a fixed screen size', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const cursor = page.locator('.pointlesh-adventure-cursor');
  const ground = await worldPoint(page, 600, 470);
  await page.mouse.move(ground.x, ground.y);
  await expect(cursor).toBeVisible(); await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk');
  await expect(page.locator('#game canvas')).toHaveCSS('cursor', 'none');
  await page.mouse.click(ground.x, ground.y);
  await expectFeedback(page, 'cursor.walk');
  await expect(cursor).toHaveAttribute('data-state', 'idle');
  expect((await cursor.boundingBox())!.width).toBe(40);
  const centroid = await page.evaluate(() => {
    const vertices = (window as any).pointleshDemo.scene.resolved().areas.find((area: any) => area.id === 'pub-door').polygon;
    return vertices.reduce((sum: any, point: any) => ({ x: sum.x + point.x / vertices.length, y: sum.y + point.y / vertices.length }), { x: 0, y: 0 });
  });
  const door = await worldPoint(page, centroid.x, centroid.y);
  await page.mouse.move(door.x, door.y);
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.interact');
  await clearFeedback(page);
  await page.mouse.click(door.x, door.y, { button: 'right' });
  await expectFeedback(page, 'cursor.interact');
  await expect(page.locator('#speech')).toContainText('windows glow');
  await page.locator('#dialog-next').click();
  await page.locator('#designer').click();
  await expect(cursor).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('cursor-designer-priority.png') });
  expect(errors).toEqual([]);
});

test('every inventory slot uses an image, selected items become animated cursors and reset after use', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.story.inventory = ['coin', 'rope', 'stout', 'mushroom', 'sleepyStout', 'pickaxe']; scene.render(); });
  const icons = page.locator('#inventory .pointlesh-asset-icon'), cursor = page.locator('.pointlesh-adventure-cursor');
  await expect(icons).toHaveCount(6);
  for (const [id, name] of [['coin', 'Copper coin'], ['rope', 'Climbing rope'], ['stout', 'Honey stout'], ['mushroom', 'Dreamcap'], ['sleepyStout', 'Dreamcap stout'], ['pickaxe', 'Goldroot pickaxe']]) {
    await clearFeedback(page);
    await page.locator('#inventory').getByRole('button', { name, exact: true }).click();
    await expect(cursor).toHaveAttribute('data-asset-id', `inventory.${id}`);
    await expectFeedback(page, `inventory.${id}`);
    await expect(cursor).toHaveAttribute('data-state', 'idle');
    const ground = await worldPoint(page, 600, 470); await page.mouse.move(ground.x, ground.y);
    await expect(cursor).toHaveAttribute('data-asset-id', `inventory.${id}`);
    await clearFeedback(page);
    await page.mouse.click(ground.x, ground.y); await expectFeedback(page, `inventory.${id}`);
    await page.getByRole('button', { name: 'Put away ×', exact: true }).click();
    await expect(cursor).toHaveAttribute('data-state', 'idle');
  }
  await page.mouse.move(300, 180);
  await page.screenshot({ path: testInfo.outputPath('inventory-art.png'), fullPage: true });
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('pub'));
  await page.locator('#inventory').getByRole('button', { name: 'Copper coin', exact: true }).click();
  await expect(cursor).toHaveAttribute('data-state', 'idle');
  await clearFeedback(page);
  await page.getByRole('button', { name: 'Interact with Mara the innkeeper', exact: true }).click();
  await expectFeedback(page, 'inventory.coin');
  await expect(page.locator('#speech')).toContainText('One honey stout');
  await expect(page.locator('#inventory').getByRole('button', { name: 'Copper coin', exact: true })).toHaveCount(0);
  await page.locator('#dialog-next').click();
  const ground = await worldPoint(page, 700, 470); await page.mouse.move(ground.x, ground.y);
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk');
});

test('asset designer exposes cursor and inventory parents with native Click animations and live previews', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.story.inventory = ['rope']; scene.render(); });
  await page.locator('#designer').click();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.getByRole('button', { name: /Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Cursors$/ }).click();
  await page.getByRole('button', { name: 'Cursor Walk', exact: true }).click();
  await expect(page.locator('.ai-game-assets-designer__current-image')).toHaveAttribute('src', /cursor.walk.png$/);
  await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('cursor.walk.click');
  await expect(page.locator('.ai-game-assets-designer__current-image')).toHaveAttribute('src', /cursor.walk.click.png$/);
  const before = await page.locator('#inventory .pointlesh-asset-icon').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.aiRuntime.designerCallbacks().onPreview('inventory.rope', scene.aiRuntime.key('inventory.coin'), scene.aiRuntime.manifest.assets['inventory.rope']);
    scene.refreshCharacterAnimations();
  });
  await expect.poll(() => page.locator('#inventory .pointlesh-asset-icon').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(before);
  await expect(page.locator('#inventory .pointlesh-asset-icon')).toHaveAttribute('data-texture', 'inventory.coin');
});
