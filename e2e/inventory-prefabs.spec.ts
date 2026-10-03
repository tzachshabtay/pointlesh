import { expect, test, type Page } from '@playwright/test';
import { openAdventure } from './start-helpers';

test.beforeEach(async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
});
async function ready(page: Page, designer = false) {
  await openAdventure(page);
  // Let the normal crossfade dispose its cinematic camera before arranging the room fixture.
  await page.evaluate(() => (window as any).pointleshDemo.scene.advanceCutscene(true));
  await expect(page.locator('body')).not.toHaveClass(/cinematic-playing/);
  await expect.poll(() => page.evaluate(() => !!(window as any).pointleshDemo.scene.cutsceneCrossfade)).toBe(false);
  await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene;
    s.introArrival = undefined; s.dismissSpeech();
    s.changeRoom('house'); s.character.stop(); s.story.inventory = ['rope', 'coin']; s.render();
  });
  if (designer) await page.locator('#designer').click();
}
async function inventoryFolder(page: Page) {
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  const browser = page.getByRole('region', { name: 'Prefab browser', exact: true });
  await browser.getByRole('button', { name: 'Open Inventory items folder', exact: true }).click();
  return browser;
}
const authoredPoint = (page: Page) => page.evaluate(() => {
  const prefab = (window as any).pointleshDemo.manifest.prefabs['forest.inventory.rope'];
  return { x: prefab.attributes.find((a: any) => a.id === 'interactionX').number.value,
    y: prefab.attributes.find((a: any) => a.id === 'interactionY').number.value };
});

test('inventory prefabs expose an enlarged preview and a draggable point with one undo checkpoint', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page, true); const browser = await inventoryFolder(page);
  await expect(browser.locator('[data-prefab-id]')).toHaveCount(6);
  await browser.getByRole('button', { name: 'Climbing rope', exact: true }).click();
  const properties = page.getByRole('region', { name: 'Pointlesh properties', exact: true });
  const marker = properties.getByRole('button', { name: 'Interaction point', exact: true });
  await expect(marker).toBeVisible();
  await expect(properties.getByRole('combobox', { name: 'Inventory graphic', exact: true })).toHaveValue('inventory.rope');
  await expect.poll(() => page.getByRole('img', { name: 'Inventory item preview' }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const original = await authoredPoint(page);
  const bounds = (await page.locator('.pointlesh-inventory-preview').boundingBox())!, handle = (await marker.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .75, { steps: 12 }); await page.mouse.up();
  expect((await authoredPoint(page)).x).toBeCloseTo(.2, 2); expect((await authoredPoint(page)).y).toBeCloseTo(.75, 2);
  await properties.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await authoredPoint(page)).toEqual(original);
  await properties.getByRole('button', { name: 'Redo', exact: true }).click(); expect((await authoredPoint(page)).x).toBeCloseTo(.2, 2);
  const exported = await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene, json = s.sceneDesigner.inspector.exportManifest();
    s.sceneDesigner.designer.setManifest(JSON.parse(json)); s.sceneDesigner.inspector.sync();
    return JSON.parse(json).prefabs['forest.inventory.rope'];
  });
  expect(exported.pointlesh.kind).toBe('inventory-item');
  expect((await authoredPoint(page)).y).toBeCloseTo(.75, 2);
  await page.screenshot({ path: testInfo.outputPath('inventory-interaction-point.png') });
  expect(errors).toEqual([]);
});

test.describe('inventory cursor targeting', () => {
  test.use({ deviceScaleFactor: 2 });
  test('the chosen point and animated crosshair stay at the pointer through sizing, zoom, clicks and consumption', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await page.evaluate(() => {
      const s = (window as any).pointleshDemo.scene, inspector = s.sceneDesigner.inspector;
      inspector.setPrefabProperties('forest.inventory.rope', { interactionX: .2, interactionY: .75 });
      s.selected = 'rope'; s.render(); s.cameras.main.setZoom(1.3);
      (window as any).crosshairFrames = [];
      s.events.on('postupdate', () => {
        const crosshair = document.querySelector<HTMLCanvasElement>('.pointlesh-adventure-crosshair');
        if (crosshair && !crosshair.hidden) (window as any).crosshairFrames.push(crosshair.dataset.frame);
      });
    });
    const position = await page.locator('#game canvas').evaluate(canvas => { const r = canvas.getBoundingClientRect(); return { x: r.x + r.width * .5, y: r.y + r.height * .6 }; });
    await page.mouse.move(position.x, position.y);
    const cursor = page.locator('.pointlesh-adventure-cursor'), crosshair = page.locator('.pointlesh-adventure-crosshair');
    await expect(cursor).toHaveAttribute('data-asset-id', 'inventory.rope'); await expect(crosshair).toBeVisible();
    const alignment = () => page.evaluate(position => {
      const c = document.querySelector('.pointlesh-adventure-cursor')!.getBoundingClientRect();
      const h = document.querySelector('.pointlesh-adventure-crosshair')!.getBoundingClientRect();
      return { item: Math.max(Math.abs(c.x + c.width * .2 - position.x), Math.abs(c.y + c.height * .75 - position.y)),
        crosshair: Math.max(Math.abs(h.x + h.width / 2 - position.x), Math.abs(h.y + h.height / 2 - position.y)) };
    }, position);
    expect((await alignment()).item).toBeLessThanOrEqual(.5); expect((await alignment()).crosshair).toBeLessThanOrEqual(.5);
    await expect.poll(() => page.evaluate(() => new Set((window as any).crosshairFrames).size)).toBeGreaterThan(2);
    await page.evaluate(() => {
      const s = (window as any).pointleshDemo.scene, image = document.createElement('canvas'); image.width = 96; image.height = 48;
      image.getContext('2d')!.fillRect(0, 0, 96, 48); s.textures.addCanvas('inventory-test-preview', image);
      const asset = structuredClone(s.aiRuntime.manifest.assets['inventory.rope']); asset.dimensions = { width: 96, height: 48 };
      s.aiRuntime.designerCallbacks().onPreview('inventory.rope', 'inventory-test-preview', asset); s.refreshCharacterAnimations();
    });
    await expect(cursor).toHaveCSS('width', '96px'); await expect(cursor).toHaveCSS('height', '48px');
    await expect(cursor).toHaveAttribute('width', '192'); await expect(crosshair).toHaveCSS('width', '16px');
    expect((await alignment()).item).toBeLessThanOrEqual(.5); expect((await alignment()).crosshair).toBeLessThanOrEqual(.5);
    await page.evaluate(() => {
      const s = (window as any).pointleshDemo.scene;
      const clip = s.aiRuntime.manifest.assets['inventory.rope.click'].animations[0]; clip.frameTimings = clip.frames.map(() => ({ delayMs: 400 }));
      s.cursor.icon.options.paused = () => true;
      s.cursor.click(s.inventoryCursor('rope')); s.selected = undefined;
    });
    await expect(cursor).toHaveAttribute('data-state', 'click'); await expect(crosshair).toBeVisible();
    expect((await alignment()).item).toBeLessThanOrEqual(.5); expect((await alignment()).crosshair).toBeLessThanOrEqual(.5);
    await page.screenshot({ path: testInfo.outputPath('inventory-cursor-crosshair.png') });
    await page.mouse.move(position.x + 5, position.y);
    await expect(cursor).toHaveAttribute('data-asset-id', 'cursor.walk'); await expect(crosshair).toHaveCount(0);
    await page.evaluate(() => { const s = (window as any).pointleshDemo.scene; s.selected = 'coin'; s.render(); });
    await expect(crosshair).toBeVisible();
    await page.locator('#designer').click(); await expect(cursor).toBeHidden(); await expect(crosshair).toBeHidden();
    await page.evaluate(() => (window as any).pointleshDemo.scene.cursor.destroy());
    await expect(crosshair).toHaveCount(0);
    // A fixed square cursor box letterboxes the wide image. Its image-local point must still target correctly.
    await page.evaluate(() => {
      const s = (window as any).pointleshDemo.scene;
      s.testCursor = new s.cursor.constructor(s, s.aiRuntime, { assetId: 'inventory.rope', size: 40,
        resolve: () => s.inventoryCursor('rope') });
    });
    await page.mouse.move(position.x, position.y);
    await expect(page.locator('.pointlesh-adventure-cursor')).toBeVisible();
    const fixed = await page.locator('.pointlesh-adventure-cursor').boundingBox();
    expect(Math.abs(fixed!.x + 40 * .2 - position.x)).toBeLessThanOrEqual(.5);
    expect(Math.abs(fixed!.y + 10 + 20 * .75 - position.y)).toBeLessThanOrEqual(.5);
    await page.evaluate(() => (window as any).pointleshDemo.scene.testCursor.destroy());
    expect(errors).toEqual([]);
  });
});

test('changing the inventory prefab graphic updates both satchel and cursor, and the crosshair is optional', async ({ page }) => {
  await ready(page, true); const browser = await inventoryFolder(page);
  await browser.getByRole('button', { name: 'Climbing rope', exact: true }).click();
  await page.getByRole('combobox', { name: 'Inventory graphic', exact: true }).selectOption('inventory.coin');
  await page.getByRole('combobox', { name: 'Crosshair graphic', exact: true }).selectOption('');
  await expect(page.locator('#inventory button').filter({ hasText: 'Climbing rope' }).locator('canvas')).toHaveAttribute('data-asset-id', 'inventory.coin');
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  await page.locator('#designer').click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.blocked())).toBe(false);
  await page.locator('#inventory').getByRole('button', { name: 'Climbing rope', exact: true }).click();
  await expect(page.locator('.pointlesh-adventure-cursor')).toHaveAttribute('data-asset-id', 'inventory.coin');
  await expect(page.locator('.pointlesh-adventure-crosshair')).toHaveCount(0);
});


test('a directly assigned crosshair animation uses frame dimensions and loops', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene;
    s.sceneDesigner.inspector.setPrefabProperties('forest.inventory.rope', { crosshairAssetId: 'cursor.crosshair.idle' });
    s.selected = 'rope'; s.render();
    (window as any).directFrames = [];
    s.events.on('postupdate', () => {
      const h = document.querySelector<HTMLCanvasElement>('.pointlesh-adventure-crosshair');
      if (h) (window as any).directFrames.push(h.dataset.frame);
    });
  });
  const bounds = (await page.locator('#game canvas').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('.pointlesh-adventure-crosshair')).toHaveCSS('width', '16px');
  await expect.poll(() => page.evaluate(() => new Set((window as any).directFrames).size)).toBeGreaterThan(2);
});
