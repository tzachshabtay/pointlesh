import { expect, test, type Page } from '@playwright/test';
import { openAdventure } from './start-helpers';
import { selectInstance, expandProperties } from './designer-helpers';

async function ready(page: Page) {
  await openAdventure(page);
  await page.locator('#skip-intro').evaluate((button: HTMLButtonElement) => button.click());
  // Respect the transition gate before programmatically starting dialog.
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.uncancellableAction())).toBe(false);
}
const portrait = (page: Page) => page.locator('#dialog-portrait canvas');
const portraitFrame = (page: Page) => portrait(page).evaluate(canvas => canvas.getAttribute('data-lip-sync-shape') ?? canvas.getAttribute('data-frame'));

test('all six speakers animate above the dialog, preserve framing, and hide when dismissed', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  for (const [id, speaker] of Object.entries({ borin: 'Borin', elder: 'Elder Rowan', innkeeper: 'Mara', miner: 'Orrin', king: 'King Aldric', guard: 'Orc guard' })) {
    await page.evaluate(speaker => (window as any).pointleshDemo.scene.say('There is more to this forest than meets the eye.', speaker), speaker);
    await expect(portrait(page)).toHaveAttribute('data-asset-id', `portrait.${id}`);
    await expect(portrait(page)).toHaveAttribute('data-state', 'speak');
    const hash = await portrait(page).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await expect.poll(() => portrait(page).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(hash);
    const face = (await page.locator('#dialog-portrait').boundingBox())!, card = (await page.locator('.dialog-body').boundingBox())!;
    expect(face.y + face.height).toBeLessThanOrEqual(card.y + 1);
    expect(face.width).toBeGreaterThan(120);
    await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene;
      scene.events.emit('postupdate', 0, 2200);
    });
    await expect(portrait(page)).toHaveAttribute('data-state', 'speak');
    expect((await page.locator('#dialog-portrait').boundingBox())!).toEqual(face);
    await page.locator('#dialog-next').click();
    await expect(page.locator('#dialog')).toBeHidden();
    await expect(portrait(page)).toHaveAttribute('data-state', 'idle');
  }
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('pub'); scene.conversation.start('innkeeper');
  });
  await page.screenshot({ path: testInfo.outputPath('mara-dialog-portrait.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('conversation changes speaker, pauses at choices, and restores the right portrait after saving', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.conversation.start('elder'));
  await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.elder');
  await page.locator('#dialog-next').click();
  await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.borin');
  await expect(portrait(page)).toHaveAttribute('data-state', 'idle');
  await page.getByRole('button', { name: 'Where did they take the king?', exact: true }).click();
  await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.elder');
  await page.locator('#menu').click();
  await page.locator('#save').click();
  await page.getByRole('button', { name: 'save slot 1', exact: true }).click();
  await page.locator('#dialog-next').click();
  await page.locator('#menu').click();
  await page.locator('#load').click();
  await page.getByRole('button', { name: 'load slot 1', exact: true }).click();
  await expect(page.locator('#speaker')).toHaveText('Elder Rowan');
  await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.elder');
  await expect(portrait(page)).toHaveAttribute('data-state', 'speak');
  await page.locator('#journal').click();
  const heldFrame = await portraitFrame(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.events.emit('postupdate', 0, 3125));
  expect(await portraitFrame(page)).toBe(heldFrame);
  await page.locator('#modal-close').click();
  await expect.poll(() => portraitFrame(page)).not.toBe(heldFrame);
  await page.evaluate(() => (window as any).pointleshDemo.scene.conversation.start('chest-locked'));
  await expect(page.locator('#speaker')).toHaveText('Runed chest');
  await expect(page.locator('#dialog-portrait')).toBeHidden();
});

test('prefab portrait dropdowns support inheritance and None, without moving the character', async ({ page }) => {
  await openAdventure(page, true);
  await selectInstance(page, 'village.npc.elder'); await expandProperties(page, 'Dialog portrait');
  const select = page.getByRole('combobox', { name: 'Portrait asset', exact: true });
  await expect(select).toHaveValue('portrait.elder');
  await expect(page.getByRole('combobox', { name: 'Portrait speaking animation', exact: true })).toHaveValue('speak');
  await page.evaluate(() => (window as any).pointleshDemo.scene.conversation.start('elder'));
  const position = await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position);
  await select.selectOption('portrait.miner');
  await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.miner');
  await select.selectOption('');
  await expect(page.locator('#dialog-portrait')).toBeHidden();
  await page.getByRole('button', { name: 'Reset Portrait asset to prefab', exact: true }).click();
  await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.elder');
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toEqual(position);
});

test('portrait speech uses live AI Assets previews while cursor click clips still finish', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.say('A closer look.'));
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene, runtime = scene.aiRuntime;
    const sprite = runtime.manifest.assets['portrait.borin.speak'];
    runtime.designerCallbacks().onPreview(sprite.id, runtime.key('portrait.elder.speak'), sprite);
    scene.refreshCharacterAnimations();
  });
  await expect(portrait(page)).toHaveAttribute('data-texture', 'portrait.elder.speak');
  await page.locator('#dialog-next').hover();
  await expect(page.locator('.pointlesh-adventure-cursor')).toHaveAttribute('data-asset-id', 'cursor.interact');
  await page.evaluate(() => (window as any).pointleshDemo.scene.cursor.click());
  await expect(page.locator('.pointlesh-adventure-cursor')).toHaveAttribute('data-state', 'idle');
  await expect(portrait(page)).toHaveAttribute('data-state', 'speak');
});

test('asset designer exposes portrait bases and their Close-up speak animations', async ({ page }) => {
  await ready(page); await page.locator('#designer').click();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.getByRole('button', { name: /Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Portraits$/ }).click();
  await page.getByRole('button', { name: 'Portrait Borin', exact: true }).click();
  await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('portrait.borin.speak');
  await expect(page.locator('.ai-game-assets-designer__current-image')).toHaveAttribute('src', /portraits\/borin.speak.png/);
  expect(await page.locator('.ai-game-assets-designer__current-image').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test.describe('mobile dialogue portraits', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('portrait, long speech, Continue and all choices fit the scene and stay usable', async ({ page }, testInfo) => {
    await ready(page);
    await page.evaluate(() => (window as any).pointleshDemo.scene.conversation.start('innkeeper'));
    const stage = (await page.locator('.stage-wrap').boundingBox())!, face = (await page.locator('#dialog-portrait').boundingBox())!, card = (await page.locator('.dialog-body').boundingBox())!;
    expect(face.width).toBeGreaterThanOrEqual(75); expect(face.height).toBeGreaterThanOrEqual(75);
    expect(face.y).toBeGreaterThanOrEqual(stage.y); expect(card.y + card.height).toBeLessThanOrEqual(stage.y + stage.height);
    await page.locator('#dialog-next').tap();
    await page.getByRole('button', { name: 'How do I get past an orc guard?', exact: true }).tap();
    await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.innkeeper');
    await page.locator('#dialog-next').scrollIntoViewIfNeeded();
    await expect(page.locator('#dialog-next')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('mobile-dialog-portrait.png'), fullPage: true });
    await page.locator('#dialog-next').tap(); await expect(page.locator('#dialog')).toBeHidden();
  });
});


test('Rowan uses recording timing for all four lines and rests when speech ends', async ({ page }) => {
  await ready(page);
  // Sample in the render loop: a slow test runner can miss a short recording
  // entirely between separate browser round-trips.
  const observed = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.conversation.start('elder');
    const sound = scene.interactionSound;
    const audioAtStart = { playing: sound?.isPlaying, paused: sound?.isPaused, context: scene.sound.context?.state, locked: scene.sound.locked };
    const sources = new Set<string>(), shapes = new Set<string>(); let maxTime = 0;
    const until = performance.now() + 6500;
    while (performance.now() < until) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const canvas = document.querySelector<HTMLCanvasElement>('#dialog-portrait canvas');
      if (canvas) { sources.add(canvas.dataset.lipSyncSource ?? ''); shapes.add(canvas.dataset.lipSyncShape ?? ''); maxTime = Math.max(maxTime, Number(canvas.dataset.lipSyncTime ?? 0)); }
    }
    return { sources: [...sources], shapes: [...shapes], maxTime, audioAtStart };
  });
  expect(observed.sources).toContain('rhubarb');
  expect(observed.maxTime, JSON.stringify(observed)).toBeGreaterThan(.1);
  expect(observed.shapes.some(shape => shape !== 'X' && shape !== '')).toBe(true);
  await expect(portrait(page)).toHaveAttribute('data-lip-sync-shape', 'X');
  for (const [index, choice] of ['Where did they take the king?', 'I could use a little advice.', 'I will bring him home.'].entries()) {
    if (index > 0) await page.evaluate(() => (window as any).pointleshDemo.scene.conversation.start('elder'));
    await page.locator('#dialog-next').click();
    await page.getByRole('button', { name: choice, exact: true }).click();
    await expect(portrait(page)).toHaveAttribute('data-asset-id', 'portrait.elder');
    await expect(portrait(page)).toHaveAttribute('data-lip-sync-source', 'rhubarb');
    await page.locator('#dialog-next').click();
    await expect(page.locator('#dialog')).toBeHidden();
  }
});
