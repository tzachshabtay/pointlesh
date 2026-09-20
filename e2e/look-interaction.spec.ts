import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function ready(page: Page, room = 'village') {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(room => (window as any).pointleshDemo.scene.changeRoom(room), room);
}

async function targetPoint(page: Page, id: string) {
  return page.evaluate(id => {
    const scene = (window as any).pointleshDemo.scene;
    const object = scene.resolved().objects.find((object: any) => object.properties.targetId === id);
    let world;
    if (object) {
      const sprite = scene.entitySprites.get(object.id);
      const frames = sprite.anims.currentAnim?.frames ?? [{ textureKey: sprite.texture.key, textureFrame: sprite.frame.name }];
      const candidates = [];
      for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
        const sx = sprite.flipX ? sprite.width - x - 1 : x, sy = sprite.flipY ? sprite.height - y - 1 : y;
        if (frames.every((frame: any) => (scene.textures.getPixelAlpha(sx, sy, frame.textureKey, frame.textureFrame) ?? 0) > 200)) candidates.push({ x, y });
      }
      candidates.sort((a, b) => (a.x - sprite.width / 2) ** 2 + (a.y - sprite.height * .55) ** 2 - (b.x - sprite.width / 2) ** 2 - (b.y - sprite.height * .55) ** 2);
      if (!candidates.length) throw new Error(`No opaque pixel for ${id}`);
      const pixel = candidates[0];
      world = sprite.getWorldTransformMatrix().transformPoint(pixel.x + .5 - sprite.displayOriginX, pixel.y + .5 - sprite.displayOriginY);
    } else {
      const polygon = scene.resolved().areas.find((area: any) => area.id === id).polygon;
      world = polygon.reduce((sum: any, point: any) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }), { x: 0, y: 0 });
    }
    const camera = scene.cameras.main, canvas = scene.game.canvas.getBoundingClientRect();
    const view = camera.matrix.transformPoint(world.x, world.y);
    return { x: canvas.left + view.x * canvas.width / camera.width, y: canvas.top + view.y * canvas.height / camera.height };
  }, id);
}

async function dismiss(page: Page) {
  await page.locator('#dialog-next').click();
  await expect(page.locator('#dialog')).toBeHidden();
}

const state = (page: Page) => page.evaluate(() => {
  const scene = (window as any).pointleshDemo.scene;
  return { room: scene.story.roomId, inventory: scene.story.inventory, flags: scene.story.flags, position: scene.character.state.position, selected: scene.selected ?? null };
});

test('holding the primary mouse button looks without starting an interaction', async ({ page }) => {
  await ready(page);
  const point = await targetPoint(page, 'elder'), before = await state(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(page.locator('#speech')).toContainText('The oldest beard in Bramblehollow', { timeout: 2000 });
  expect(await state(page)).toEqual(before);
  await page.evaluate(() => (window as any).pointleshDemo.scene.dismissSpeech());
  await page.mouse.up();
  await page.waitForTimeout(150);
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await state(page)).toEqual(before);
});

test('right click looks at characters, objects and exits without interacting or walking', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => {
    (window as any).canvasMenuPrevented = false;
    window.addEventListener('contextmenu', event => { if (event.target instanceof HTMLCanvasElement) (window as any).canvasMenuPrevented = event.defaultPrevented; });
  });
  const before = await state(page);
  for (const [id, text] of [['elder', 'The oldest beard in Bramblehollow'], ['pub-door', 'The windows glow with breakfast']]) {
    const point = await targetPoint(page, id);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.locator('#speech')).toContainText(text);
    await expect(page.locator('#speaker')).toHaveText('Borin');
    expect(await state(page)).toEqual(before);
    await dismiss(page);
  }
  expect(await page.evaluate(() => (window as any).canvasMenuPrevented)).toBe(true);
  const canvas = await page.locator('#game canvas').boundingBox();
  await page.mouse.click(canvas!.x + 15, canvas!.y + 15, { button: 'right' });
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await state(page)).toEqual(before);
  const elder = await targetPoint(page, 'elder');
  await page.mouse.click(elder.x, elder.y);
  await expect(page.locator('#speaker')).toHaveText('Elder Rowan');
  expect(errors).toEqual([]);
});

test('look leaves a pickup and selected inventory item untouched, while left click still collects', async ({ page }) => {
  await ready(page, 'house');
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.story.inventory.push('coin'); scene.selected = 'coin'; scene.render();
  });
  const rope = await targetPoint(page, 'rope'), before = await state(page);
  await page.mouse.click(rope.x, rope.y, { button: 'right' });
  await expect(page.locator('#speech')).toContainText('A coil of good dwarven climbing rope');
  expect(await state(page)).toEqual(before);
  await dismiss(page);
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.selected = undefined; scene.render(); });
  await page.mouse.click(rope.x, rope.y);
  await expect(page.locator('#speech')).toContainText('Never go on a rescue without a rope');
  expect((await state(page)).inventory).toContain('rope');
});

test('touch holds look once at sprites and hotspots; taps still interact and walk', async ({ page }) => {
  await ready(page);
  const session = await page.context().newCDPSession(page);
  for (const [room, id, text] of [
    ['village', 'elder', 'The oldest beard in Bramblehollow'],
    ['village', 'pub-door', 'The windows glow with breakfast'],
    ['house', 'rope', 'A coil of good dwarven climbing rope'],
  ]) {
    await page.evaluate(room => (window as any).pointleshDemo.scene.changeRoom(room), room);
    const point = await targetPoint(page, id), before = await state(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await expect(page.locator('#speech')).toContainText(text);
    expect(await state(page)).toEqual(before);
    // Dismiss while still holding, then release: release must not run the interaction.
    await page.evaluate(() => (window as any).pointleshDemo.scene.dismissSpeech());
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    await expect(page.locator('#dialog')).toBeHidden();
    expect(await state(page)).toEqual(before);
  }
  const rope = await targetPoint(page, 'rope');
  await page.touchscreen.tap(rope.x, rope.y);
  await expect(page.locator('#speech')).toContainText('Never go on a rescue without a rope');
  await dismiss(page);
  const canvas = await page.locator('#game canvas').boundingBox(), before = await state(page);
  await page.touchscreen.tap(canvas!.x + canvas!.width * .6, canvas!.y + canvas!.height * .85);
  await expect.poll(async () => (await state(page)).position).not.toEqual(before.position);
});

test('touch dragging and cancellation do not look, interact or walk', async ({ page }) => {
  await ready(page);
  const session = await page.context().newCDPSession(page);
  const point = await targetPoint(page, 'elder'), before = await state(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 45, y: point.y, id: 1 }] });
  await page.waitForTimeout(600);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await state(page)).toEqual(before);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(600);
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await state(page)).toEqual(before);
});
