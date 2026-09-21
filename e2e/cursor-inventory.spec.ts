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

test('walk and interact cursors switch, animate on click, and use the base asset size', async ({ page }, testInfo) => {
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
  const baseWidth = await page.evaluate(() => (window as any).pointleshDemo.scene.aiRuntime.manifest.assets['cursor.walk'].dimensions.width);
  expect((await cursor.boundingBox())!.width).toBe(baseWidth);
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

test('hovering scenery or a character interrupts walk feedback immediately', async ({ page }) => {
  await ready(page);
  const cursor = page.locator('.pointlesh-adventure-cursor');
  // A long clip makes the regression fail instead of passing after the old animation expires.
  await page.evaluate(() => {
    const runtime = (window as any).pointleshDemo.scene.aiRuntime;
    const clip = runtime.manifest.assets['cursor.walk.click'].animations[0];
    clip.frameTimings = clip.frames.map(() => ({ delayMs: 2000 }));
  });
  for (const target of ['pub-door', 'village.npc.elder']) {
    const ground = await worldPoint(page, 600, 470);
    await page.mouse.click(ground.x, ground.y);
    await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk');
    await expect(cursor).toHaveAttribute('data-state', 'click');
    const point = await page.evaluate(target => {
      const scene = (window as any).pointleshDemo.scene;
      scene.character.stop();
      if (target === 'pub-door') {
        const vertices = scene.resolved().areas.find((area: any) => area.id === target).polygon;
        return vertices.reduce((sum: any, p: any) => ({ x: sum.x + p.x / vertices.length, y: sum.y + p.y / vertices.length }), { x: 0, y: 0 });
      }
      const sprite = scene.entitySprites.get(target);
      return { x: sprite.x, y: sprite.y - sprite.displayHeight / 2 };
    }, target);
    const screen = await worldPoint(page, point.x, point.y);
    await page.mouse.move(screen.x, screen.y);
    await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.interact', { timeout: 2000 });
    await expect(cursor).toHaveAttribute('data-state', 'idle');
  }
  // Explicit item feedback survives a selection change, but never locks out the next hover.
  const ground = await worldPoint(page, 600, 470);
  await page.mouse.move(ground.x, ground.y);
  await clearFeedback(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.cursor.click('inventory.coin'));
  await expectFeedback(page, 'inventory.coin');
  await page.mouse.move(ground.x + 5, ground.y);
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk', { timeout: 2000 });
  await expect(cursor).toHaveAttribute('data-state', 'idle');
  await page.evaluate(() => {
    const cursor = (window as any).pointleshDemo.scene.cursor;
    cursor.click('inventory.coin'); cursor.click();
  });
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk');
  await expect(cursor).toHaveAttribute('data-state', 'click');
});

test('speech and conversation choices retain the interact cursor on the game and dialog controls', async ({ page }) => {
  await ready(page);
  const cursor = page.locator('.pointlesh-adventure-cursor');
  const ground = await worldPoint(page, 600, 470);
  await page.mouse.move(ground.x, ground.y);
  await page.evaluate(() => (window as any).pointleshDemo.scene.say('A cursor should remain available while speaking.'));
  await expect(cursor).toBeVisible();
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.interact');
  await page.locator('#speech').hover();
  await expect(cursor).toBeVisible();
  await expect(page.locator('#speech')).toHaveCSS('cursor', 'none');
  await page.locator('#dialog-next').hover();
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.interact');
  await expect(page.locator('#dialog-next')).toHaveCSS('cursor', 'none');
  await page.locator('#dialog-next').click();
  await page.mouse.move(ground.x, ground.y);
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk');

  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.selected = 'rope'; scene.conversation.start('elder');
  });
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.interact');
  await page.locator('#dialog-next').click();
  const choice = page.getByRole('button', { name: 'I will bring him home.', exact: true });
  await choice.hover();
  await expect(cursor).toBeVisible();
  await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.interact');
  await expect(choice).toHaveCSS('cursor', 'none');
  await choice.click();
  await page.locator('#dialog-next').click();
  await expect(page.locator('#dialog')).toBeHidden();
  await page.mouse.move(ground.x, ground.y);
  await expect(cursor).toHaveAttribute('data-asset-id', 'inventory.rope');
  await page.locator('#designer').click();
  await expect(cursor).toBeHidden();
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
  const activeFile = (id: string) => page.evaluate(id => {
    const asset = (window as any).pointleshDemo.scene.aiRuntime.manifest.assets[id];
    return asset.versions[asset.activeVersion].file;
  }, id);
  await expect.poll(() => page.locator('.ai-game-assets-designer__current-image').getAttribute('src')).toContain(await activeFile('cursor.walk'));
  await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('cursor.walk.click');
  await expect.poll(() => page.locator('.ai-game-assets-designer__current-image').getAttribute('src')).toContain(await activeFile('cursor.walk.click'));
  const before = await page.locator('#inventory .pointlesh-asset-icon').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.aiRuntime.designerCallbacks().onPreview('inventory.rope', scene.aiRuntime.key('inventory.coin'), scene.aiRuntime.manifest.assets['inventory.rope']);
    scene.refreshCharacterAnimations();
  });
  await expect.poll(() => page.locator('#inventory .pointlesh-asset-icon').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(before);
  await expect(page.locator('#inventory .pointlesh-asset-icon')).toHaveAttribute('data-texture', 'inventory.coin');
});

test.describe('cursor asset sizing', () => {
  test.use({ deviceScaleFactor: 2 });
  test('previews and promotions resize the cursor while clicks, variants and camera zoom preserve its bounds', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    const cursor = page.locator('.pointlesh-adventure-cursor');
    const ground = await worldPoint(page, 600, 470); await page.mouse.move(ground.x, ground.y);
    const preview = async (width: number, height: number) => page.evaluate(({ width, height }) => {
      const scene = (window as any).pointleshDemo.scene, key = `cursor-preview-${width}-${height}`;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.fillRect(0, 0, width, height); scene.textures.addCanvas(key, canvas);
      const asset = structuredClone(scene.aiRuntime.manifest.assets['cursor.walk']); asset.dimensions = { width, height };
      scene.aiRuntime.designerCallbacks().onPreview('cursor.walk', key, asset); scene.refreshCharacterAnimations();
    }, { width, height });
    await preview(96, 48);
    await expect(cursor).toHaveCSS('width', '96px'); await expect(cursor).toHaveCSS('height', '48px');
    await expect(cursor).toHaveAttribute('width', '192'); await expect(cursor).toHaveAttribute('height', '96');
    const box = (await cursor.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - ground.x)).toBeLessThanOrEqual(.5);
    expect(Math.abs(box.y + box.height / 2 - ground.y)).toBeLessThanOrEqual(.5);
    await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene; (window as any).clickSizes = [];
      scene.events.on('postupdate', () => {
        if (scene.cursor.icon.playing) (window as any).clickSizes.push([scene.cursor.icon.displayWidth, scene.cursor.icon.displayHeight]);
      });
    });
    await page.mouse.click(ground.x, ground.y); await expectFeedback(page, 'cursor.walk');
    await expect(cursor).toHaveAttribute('data-state', 'idle');
    const sizes = await page.evaluate(() => (window as any).clickSizes);
    expect(sizes.length).toBeGreaterThan(0); expect(sizes.every((size: number[]) => size[0] === 96 && size[1] === 48)).toBe(true);
    await preview(24, 64);
    await expect(cursor).toHaveCSS('width', '24px'); await expect(cursor).toHaveCSS('height', '64px');
    const fixedSize = await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene;
      const fixed = new scene.cursor.constructor(scene, scene.aiRuntime, { assetId: 'cursor.walk', size: 40, resolve: () => undefined });
      const size = [fixed.icon.displayWidth, fixed.icon.displayHeight]; fixed.destroy(); return size;
    });
    expect(fixedSize).toEqual([40, 40]);
    await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene, runtime = scene.aiRuntime;
      const image = (width: number, height: number) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.getContext('2d')!.fillRect(0, 0, width, height); return canvas; };
      scene.textures.remove('cursor.walk'); scene.textures.addCanvas('cursor.walk', image(80, 40));
      scene.textures.addCanvas('cursor.walk::scaled::test-cursor-2x.png', image(160, 80));
      const manifest = structuredClone(runtime.manifest), asset = manifest.assets['cursor.walk']; asset.dimensions = { width: 80, height: 40 };
      const version = asset.versions[asset.activeVersion];
      version.scaledVariants = { retina: { id: 'retina', dimensions: { width: 160, height: 80 }, file: 'test-cursor-2x.png', method: 'nearest', sourceFile: version.file, createdAt: '2026-09-20T00:00:00Z' } };
      const callbacks = runtime.designerCallbacks(); callbacks.onManifestUpdated(manifest); callbacks.onAssetReady('cursor.walk', 'cursor.walk', asset); scene.refreshCharacterAnimations();
      scene.character.stop(); scene.cameras.main.setZoom(1.5);
    });
    await expect(cursor).toHaveCSS('width', '80px'); await expect(cursor).toHaveCSS('height', '40px');
    await expect(cursor).toHaveAttribute('width', '160'); await expect(cursor).toHaveAttribute('height', '80');
    await expect(cursor).toHaveAttribute('data-texture', 'cursor.walk::scaled::test-cursor-2x.png');
    expect(errors).toEqual([]);
  });
});
