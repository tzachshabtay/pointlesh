import { expect, test, type Page } from '@playwright/test';

async function actor(page: Page) {
  return page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    return {
      texture: scene.actor.texture.key,
      animation: scene.actor.anims.currentAnim?.key,
      frame: scene.actor.frame.name,
      flip: scene.actor.flipX,
      facing: scene.character.state.facing,
      activity: scene.character.state.activity,
      x: scene.character.state.position.x,
      y: scene.character.state.position.y,
    };
  });
}

test('gameplay renders distinct directional walk and speaking assets, including mirrored right movement', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect.poll(async () => (await actor(page)).animation).toContain('idle-front');
  for (const [key, direction, facing, flip] of [
    ['ArrowDown', 'front', 'down', false],
    ['ArrowUp', 'back', 'up', false],
    ['ArrowLeft', 'left', 'left', false],
    ['ArrowRight', 'left', 'right', true],
  ] as const) {
    await page.keyboard.down(key);
    await expect.poll(async () => (await actor(page)).animation).toContain(`walk-${direction}`);
    const moving = await actor(page);
    expect(moving.facing).toBe(facing);
    expect(moving.flip).toBe(flip);
    expect(moving.texture).toContain(`borin.walk-${direction}`);
    await expect.poll(async () => (await actor(page)).frame).not.toBe(moving.frame);
    await page.keyboard.up(key);
    await expect.poll(async () => (await actor(page)).animation).toContain(`idle-${direction}`);
  }
  await page.getByRole('button', { name: 'A little nudge? ↗', exact: true }).click();
  await expect(page.locator('#dialog')).toBeVisible();
  await expect.poll(async () => (await actor(page)).animation).toContain('speak-left');
  expect((await actor(page)).flip).toBe(true);
  const speakingFrame = (await actor(page)).frame;
  await expect.poll(async () => (await actor(page)).frame).not.toBe(speakingFrame);
  const restoredSpeech = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const saved = scene.snapshot();
    scene.restore(saved);
    return { before: saved.characters.borin, after: scene.snapshot().characters.borin };
  });
  expect(restoredSpeech.after).toEqual(restoredSpeech.before);
  await page.locator('#dialog-next').click();
  await page.getByRole('button', { name: 'Interact with Elder Rowan', exact: true }).click();
  await expect(page.locator('#dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.npcActors.get('village.npc.elder').sprite.anims.currentAnim?.key)).toContain('elder.speak-front');
  await page.screenshot({ path: testInfo.outputPath('directional-character-dialog.png'), fullPage: true });
  await page.locator('#dialog-next').click();
  await expect(page.getByRole('button', { name: 'Where did they take the king?', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.npcActors.get('village.npc.elder').sprite.anims.currentAnim?.key)).toContain('elder.idle-front');
  expect(errors).toEqual([]);
});

test('native Assets groups short names and exposes a static base image plus editable animation clips', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.getByRole('button', { name: /Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Objects$/ }).click();
  const assetItems = page.locator('.ai-game-assets-designer__asset-item');
  await expect(assetItems).toHaveText(['Coin', 'Mushroom', 'Rope']);
  await assetItems.filter({ hasText: /^Coin$/ }).click();
  await expect(page.locator('.ai-game-assets-designer__asset-item.is-selected')).toHaveText('Coin');
  await page.locator('.ai-game-assets-designer__asset-breadcrumb').filter({ hasText: /^Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
  await page.getByRole('button', { name: 'Borin', exact: true }).click();
  const animation = page.locator('.ai-game-assets-designer__animation-select');
  await expect(animation.locator('option')).toHaveCount(10);
  await expect(animation).toHaveValue('borin');
  await expect(animation.locator('option:checked')).toHaveText('Base image');
  const current = page.locator('.ai-game-assets-designer__current');
  const currentImage = current.locator('.ai-game-assets-designer__current-image');
  await expect(currentImage).toHaveAttribute('src', /characters\/borin\/base\.png$/);
  await expect.poll(() => currentImage.evaluate(image => ({ width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight }))).toEqual({ width: 24, height: 32 });
  await expect(page.locator('.ai-game-assets-designer__panel').getByLabel('Frames', { exact: true })).toBeHidden();
  await expect(current.getByRole('button', { name: 'Edit...', exact: true })).toBeHidden();
  await expect(current.locator('.ai-game-assets-designer__animation-stage')).toBeHidden();
  await expect(current.getByRole('button', { name: 'Touch up...', exact: true })).toBeVisible();
  const imageModel = page.getByRole('combobox', { name: 'Image model', exact: true });
  await expect(imageModel).toHaveValue('gpt-image-2.5-flare');
  await expect(imageModel.locator('option')).toHaveText(['GPT Image 2.5 Flare', 'GPT Image 2.5 Sunburst']);
  await imageModel.selectOption('gpt-image-2.5-sunburst');
  await expect(imageModel).toHaveValue('gpt-image-2.5-sunburst');
  await imageModel.selectOption('gpt-image-2.5-flare');
  for (const activity of ['idle', 'walk', 'speak']) {
    for (const direction of ['front', 'back', 'left']) {
      await expect(animation.locator(`option[value="borin.${activity}-${direction}"]`)).toHaveCount(1);
    }
  }
  const edit = page.locator('.ai-game-assets-designer__current button').filter({ hasText: 'Edit...' });
  const modal = page.getByRole('dialog', { name: /Edit Borin .* animation/ });
  const frames = modal.locator('.ai-game-assets-designer__frame-strip button');
  await animation.selectOption('borin.walk-back');
  await expect(currentImage).toHaveAttribute('src', /characters\/borin\/walk-back\.png$/);
  await edit.click();
  await expect(frames).toHaveCount(4);
  await expect(modal.getByLabel('Delay ms', { exact: true })).toHaveValue('100');
  const previewFrame = modal.locator('.ai-game-assets-designer__modal-stage > .ai-game-assets-designer__frame-image');
  const firstFrame = await previewFrame.evaluate(element => (element as HTMLElement).style.backgroundPosition);
  await expect.poll(() => previewFrame.evaluate(element => (element as HTMLElement).style.backgroundPosition)).not.toBe(firstFrame);
  await page.screenshot({ path: testInfo.outputPath('native-animation-editor.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await animation.selectOption('borin.speak-front');
  await edit.click();
  await expect(frames).toHaveCount(2);
  await expect(modal.getByLabel('Delay ms', { exact: true })).toHaveValue('167');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await animation.selectOption('borin.idle-front');
  await edit.click();
  await modal.getByLabel('Delay ms', { exact: true }).fill('250');
  await modal.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.config.frameDurationMs)).toBe(250);
  expect(errors).toEqual([]);
});
