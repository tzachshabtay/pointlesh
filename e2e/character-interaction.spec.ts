import { expect, test, type Page } from '@playwright/test';

async function spritePoint(page: Page, instanceId: string, sample: 'opaque' | 'transparent' | 'mirrored' = 'opaque') {
  return page.evaluate(({ instanceId, sample }) => {
    const scene = (window as any).pointleshDemo.scene;
    const sprite = scene.entitySprites.get(instanceId);
    const frames = sprite.anims.currentAnim?.frames ?? [{ textureKey: sprite.texture.key, textureFrame: sprite.frame.name }];
    const textureAlpha = (x: number, y: number, frame: any) => scene.textures.getPixelAlpha(x, y, frame.textureKey, frame.textureFrame) ?? 0;
    const candidates = [];
    for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
      const sourceX = sprite.flipX ? sprite.width - x - 1 : x;
      const sourceY = sprite.flipY ? sprite.height - y - 1 : y;
      const stable = frames.every((frame: any) => sample === 'transparent'
        ? textureAlpha(sourceX, sourceY, frame) === 0
        : textureAlpha(sourceX, sourceY, frame) > 200 && (sample !== 'mirrored' || textureAlpha(x, y, frame) === 0));
      if (stable) candidates.push({ x, y });
    }
    if (!candidates.length) throw new Error(`No ${sample} pixel in ${sprite.texture.key}/${sprite.frame.name}`);
    candidates.sort((a, b) => (a.x - sprite.width / 2) ** 2 + (a.y - sprite.height * .55) ** 2 - ((b.x - sprite.width / 2) ** 2 + (b.y - sprite.height * .55) ** 2));
    const local = candidates[0];
    const world = sprite.getWorldTransformMatrix().transformPoint(local.x + .5 - sprite.displayOriginX, local.y + .5 - sprite.displayOriginY);
    const camera = scene.cameras.main, bounds = scene.game.canvas.getBoundingClientRect();
    return {
      x: bounds.left + ((world.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2) * bounds.width / camera.width,
      y: bounds.top + ((world.y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2) * bounds.height / camera.height,
    };
  }, { instanceId, sample });
}

async function dismissElder(page: Page) {
  await page.locator('#dialog-next').click();
  await page.getByRole('button', { name: 'I will bring him home.', exact: true }).click();
  await page.locator('#dialog-next').click();
  await expect(page.locator('#dialog')).toBeHidden();
}

test('NPC sprite pixels are clickable and follow native authored movement, scale, and mirrored frames', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const elder = 'village.npc.elder';
  const before = await spritePoint(page, elder);
  await page.mouse.move(before.x, before.y);
  await expect(page.locator('#hover-label')).toHaveText('Elder Rowan');
  await page.mouse.click(before.x, before.y);
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#speaker')).toHaveText('Elder Rowan');
  await dismissElder(page);

  await page.locator('#designer').click();
  // Selection opens the native controls; the authored edit goes through their DOM fields.
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.select({ type: 'object', sceneId: 'village', layerId: 'village.adventure', objectId: 'village.npc.elder::object' }));
  const x = page.getByRole('spinbutton', { name: 'X', exact: true });
  await x.fill('650'); await x.press('Tab');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.resolved().objects.find((object: any) => object.id === 'village.npc.elder').position.x)).toBe(650);
  for (const label of ['Scale X', 'Scale Y']) {
    const scale = page.getByRole('spinbutton', { name: label, exact: true });
    await scale.fill('2.8'); await scale.press('Tab');
  }
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.resolved().objects.find((object: any) => object.id === 'village.npc.elder').scaleX)).toBe(2.8);
  await page.getByRole('button', { name: 'Toggle Adventure', exact: true }).click();
  await page.getByRole('combobox', { name: 'Adventure entity', exact: true }).selectOption(elder);
  await page.getByRole('combobox', { name: 'Facing', exact: true }).selectOption({ label: 'Right' });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.resolved().objects.find((object: any) => object.id === 'village.npc.elder').properties.facing)).toBe('right');
  await page.getByRole('button', { name: 'Toggle Adventure', exact: true }).click();
  await page.locator('#designer').click();
  await expect.poll(() => page.evaluate(() => {
    const sprite = (window as any).pointleshDemo.scene.entitySprites.get('village.npc.elder');
    return { x: sprite.x, flip: sprite.flipX };
  })).toMatchObject({ x: 650, flip: true });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('village.npc.elder').scaleX)).toBeCloseTo(2.8, 5);

  await page.mouse.move(before.x, before.y);
  await expect(page.locator('#hover-label')).not.toHaveText('Elder Rowan');
  await page.mouse.click(before.x, before.y);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.activity)).toBe('idle');
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.resolved().areas.some((area: any) => area.id === 'elder'))).toBe(false);

  const transparent = await spritePoint(page, elder, 'transparent');
  await page.mouse.move(transparent.x, transparent.y);
  await expect(page.locator('#hover-label')).not.toHaveText('Elder Rowan');
  const moved = await spritePoint(page, elder, 'mirrored');
  await page.mouse.move(moved.x, moved.y);
  await expect(page.locator('#hover-label')).toHaveText('Elder Rowan');
  await page.mouse.click(moved.x, moved.y);
  await expect(page.locator('#speaker')).toHaveText('Elder Rowan');
  await expect(page.locator('#dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toMatchObject({ x: 650, y: 443 });
  await page.screenshot({ path: testInfo.outputPath('moved-character-direct-dialog.png'), fullPage: true });
  expect(errors).toEqual([]);
});
