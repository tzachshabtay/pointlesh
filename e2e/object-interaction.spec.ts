import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page, room: string) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(room => (window as any).pointleshDemo.scene.changeRoom(room), room);
}

async function spritePoint(page: Page, instanceId: string, opaque = true) {
  return page.evaluate(({ instanceId, opaque }) => {
    const scene = (window as any).pointleshDemo.scene, sprite = scene.entitySprites.get(instanceId);
    const candidates: { x: number; y: number }[] = [];
    for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
      const alpha = scene.textures.getPixelAlpha(sprite.flipX ? sprite.width - x - 1 : x, sprite.flipY ? sprite.height - y - 1 : y, sprite.texture.key, sprite.frame.name) ?? 0;
      if (opaque ? alpha > 200 : alpha === 0) candidates.push({ x, y });
    }
    candidates.sort((a, b) => (a.x - sprite.width / 2) ** 2 + (a.y - sprite.height / 2) ** 2 - (b.x - sprite.width / 2) ** 2 - (b.y - sprite.height / 2) ** 2);
    const pixel = candidates[0];
    if (!pixel) throw new Error('No suitable sprite pixel');
    const world = sprite.getWorldTransformMatrix().transformPoint(pixel.x + .5 - sprite.displayOriginX, pixel.y + .5 - sprite.displayOriginY);
    const camera = scene.cameras.main, canvas = scene.game.canvas.getBoundingClientRect();
    const view = camera.matrix.transformPoint(world.x, world.y);
    return { x: canvas.left + view.x * canvas.width / camera.width, y: canvas.top + view.y * canvas.height / camera.height };
  }, { instanceId, opaque });
}

async function dismiss(page: Page) {
  await page.locator('#dialog-next').click();
  await expect(page.locator('#dialog')).toBeHidden();
}

test('rope sprite follows authored transforms and its interactive toggle without a duplicate area', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page, 'house');
  const rope = 'house.pickup.rope';
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('house.pickup.rope').texture.key)).toBe('pickup.rope');
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.resolved().areas.some((area: any) => area.id === 'rope' || area.id === 'coin'))).toBe(false);
  const transparent = await spritePoint(page, rope, false);
  await page.mouse.move(transparent.x, transparent.y);
  await expect(page.locator('#hover-label')).not.toHaveText('Climbing rope');
  const original = await spritePoint(page, rope);
  await page.mouse.move(original.x, original.y);
  await expect(page.locator('#hover-label')).toHaveText('Climbing rope');

  await page.locator('#designer').click();
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.select({ type: 'object', sceneId: 'house', layerId: 'house.adventure', objectId: 'house.pickup.rope::object' }));
  for (const [label, value] of [['X', '650'], ['Scale X', '3.5'], ['Scale Y', '3']]) {
    const field = page.getByRole('spinbutton', { name: label, exact: true });
    await field.fill(value); await field.press('Tab');
  }
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.locator('#designer').click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('house.pickup.rope').x)).toBe(650);
  await page.mouse.move(original.x, original.y);
  await expect(page.locator('#hover-label')).not.toHaveText('Climbing rope');

  const toggle = async (interactive: boolean) => page.evaluate(interactive => {
    const api = (window as any).pointleshDemo, manifest = api.manifest;
    manifest.scenes.house.layers[0].prefabs.find((instance: any) => instance.id === 'house.pickup.rope').pointlesh.properties.interactive = interactive;
    api.setManifest(manifest);
  }, interactive);
  await toggle(false);
  await expect(page.getByRole('button', { name: 'Interact with Climbing rope', exact: true })).toBeDisabled();
  const moved = await spritePoint(page, rope);
  await page.mouse.move(moved.x, moved.y);
  await expect(page.locator('#hover-label')).not.toHaveText('Climbing rope');
  await page.evaluate(() => (window as any).pointleshDemo.scene.act('rope'));
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.story.inventory.includes('rope'))).toBe(false);

  await toggle(true);
  await expect(page.getByRole('button', { name: 'Interact with Climbing rope', exact: true })).toBeEnabled();
  const clickable = await spritePoint(page, rope);
  await page.mouse.move(clickable.x, clickable.y);
  await expect(page.locator('#hover-label')).toHaveText('Climbing rope');
  await page.mouse.click(clickable.x, clickable.y);
  await expect(page.locator('#speech')).toContainText('Never go on a rescue without a rope');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toMatchObject({ x: 650, y: 443 });
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('house.pickup.rope').visible)).toBe(false);
  await expect(page.getByRole('button', { name: 'Interact with Climbing rope', exact: true })).toHaveCount(0);
  await dismiss(page);
  await page.mouse.move(clickable.x, clickable.y);
  await expect(page.locator('#hover-label')).not.toHaveText('Climbing rope');
  await page.evaluate(() => (window as any).pointleshDemo.scene.act('rope'));
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.story.inventory.filter((item: string) => item === 'rope').length)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('moved-rope-collected.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('coin and mushroom use direct sprite clicks and the same Nearby behavior', async ({ page }) => {
  await ready(page, 'house');
  const coin = await spritePoint(page, 'house.pickup.coin');
  await page.mouse.click(coin.x, coin.y);
  await expect(page.locator('#speech')).toContainText('One copper coin');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toMatchObject({ x: 516, y: 421 });
  await dismiss(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('forest'));
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.resolved().areas.some((area: any) => area.id === 'mushroom'))).toBe(false);
  const mushroom = await spritePoint(page, 'forest.pickup.mushroom');
  await page.mouse.click(mushroom.x, mushroom.y);
  await expect(page.locator('#speech')).toContainText('ask someone');
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('forest.pickup.mushroom').visible)).toBe(true);
  await dismiss(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.story.flags.knowsDreamcap = true);
  await page.getByRole('button', { name: 'Interact with Dreamcap mushrooms', exact: true }).click();
  await expect(page.locator('#speech')).toContainText('A dreamcap.');
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('forest.pickup.mushroom').visible)).toBe(false);
});

test('a generic object can render an AI Assets image and dispatch a client behavior', async ({ page }) => {
  await ready(page, 'mine');
  await page.evaluate(() => {
    const api = (window as any).pointleshDemo, scene = api.scene, manifest = api.manifest;
    (window as any).customObjectInteractions = 0;
    scene.behaviors.register('client.inspect', { handle: () => { (window as any).customObjectInteractions++; } });
    manifest.scenes.mine.layers[0].prefabs.push({
      id: 'mine.client-object', prefabId: 'pointlesh.object', name: 'Client object', visible: true, locked: false,
      overrides: { object: { assetId: 'character.elder', x: 500, y: 400, scaleX: 3, scaleY: 3, rotation: 20 } },
      pointlesh: { properties: { targetId: 'client-object', approachOffsetX: 0, approachOffsetY: 30 }, behaviors: ['client.inspect'] },
    });
    api.setManifest(manifest);
  });
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('mine.client-object').texture.key)).toContain('character.elder');
  const object = await spritePoint(page, 'mine.client-object');
  await page.mouse.move(object.x, object.y);
  await expect(page.locator('#hover-label')).toHaveText('Client object');
  await page.mouse.click(object.x, object.y);
  await expect.poll(() => page.evaluate(() => (window as any).customObjectInteractions)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toMatchObject({ x: 500, y: 430 });
  const previewTexture = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const texture = scene.aiRuntime.key('character.borin');
    scene.aiRuntime.designerCallbacks().onPreview('character.elder', texture, scene.aiRuntime.manifest.assets['character.elder']);
    scene.syncEntities();
    return { expected: texture, actual: scene.entitySprites.get('mine.client-object').texture.key };
  });
  expect(previewTexture.actual).toBe(previewTexture.expected);
  const previousPoint = await spritePoint(page, 'mine.client-object');
  await page.evaluate(() => {
    const api = (window as any).pointleshDemo, manifest = api.manifest;
    manifest.scenes.mine.layers[0].prefabs.find((instance: any) => instance.id === 'mine.client-object').overrides.object.assetId = 'client.unavailable';
    api.setManifest(manifest);
  });
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.has('mine.client-object'))).toBe(false);
  await page.mouse.click(previousPoint.x, previousPoint.y);
  expect(await page.evaluate(() => (window as any).customObjectInteractions)).toBe(1);
});
