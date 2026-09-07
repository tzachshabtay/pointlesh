import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectCastMotion, expectCinematicCleanup } from './cinematic-helpers';

async function ready(page: Page, skipIntro = true) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('canvas').first()).toBeVisible();
  if (skipIntro) await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
}
async function target(page: Page, name: string) {
  await page.getByRole('button', { name: `Interact with ${name}`, exact: true }).click();
}
async function speech(page: Page, text?: string | RegExp) {
  await expect(page.locator('#dialog')).toBeVisible();
  if (text) await expect(page.locator('#speech')).toContainText(text);
}
async function dismiss(page: Page) {
  await page.locator('#dialog-next').click();
  await expect(page.locator('#dialog')).toBeHidden();
}
async function travel(page: Page, name: string, room: string) {
  await target(page, name);
  await expect(page.locator('#room-name')).toHaveText(room);
}
async function converse(page: Page, name: string, option: string) {
  await target(page, name);
  await speech(page);
  await page.locator('#dialog-next').click();
  await page.getByRole('button', { name: option, exact: true }).click();
  await speech(page);
  await dismiss(page);
}
async function inventory(page: Page, name: string) {
  const item = page.locator('#inventory').getByRole('button', { name, exact: true });
  await expect(item).toBeVisible();
  await item.click();
}
async function supplies(page: Page) {
  await travel(page, 'My cottage', 'Borin’s Cottage');
  await target(page, 'Copper coin');
  await speech(page, 'One copper coin'); await dismiss(page);
  await target(page, 'Climbing rope');
  await speech(page, 'Never go on a rescue without a rope'); await dismiss(page);
  await travel(page, 'Back to the village', 'Bramblehollow');
}

test('complete rescue uses rooms, conversation, inventory, timing retry, and ending cutscene', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page, false);
  await expect(page.locator('#cutscene-text')).toContainText(/orcs found the king’s road/i);
  for (let index = 0; index < 4; index++) await page.locator('#cutscene-next').click();
  await expect(page.locator('#cutscene')).toBeHidden();
  await page.getByRole('button', { name: /^Map/ }).click();
  await expect(page.locator('.map-room')).toHaveCount(6);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('village.png'), fullPage: true });

  await supplies(page);
  await travel(page, 'The Copper Tankard', 'The Copper Tankard');
  await converse(page, 'Mara the innkeeper', 'How do I get past an orc guard?');
  await inventory(page, 'Copper coin');
  await target(page, 'Mara the innkeeper');
  await speech(page, 'One honey stout'); await dismiss(page);
  await expect(page.locator('#inventory').getByRole('button', { name: 'Honey stout', exact: true })).toBeVisible();
  await expect(page.locator('#inventory').getByRole('button', { name: 'Copper coin', exact: true })).toHaveCount(0);
  await converse(page, 'Orrin the miner', 'The king needs us. How do I open the chest?');
  await travel(page, 'Back to the village', 'Bramblehollow');
  await travel(page, 'Forest path', 'The Whispering Wood');
  await target(page, 'Dreamcap mushrooms');
  await speech(page, 'A dreamcap'); await dismiss(page);
  await inventory(page, 'Dreamcap');
  await inventory(page, 'Honey stout');
  await speech(page, 'A pinch of dreamcap'); await dismiss(page);
  await expect(page.locator('#inventory').getByRole('button', { name: 'Dreamcap stout', exact: true })).toBeVisible();
  await travel(page, 'Goldroot Mine', 'The Goldroot Mine');
  await converse(page, 'Runed tool chest', 'Stone remembers.');
  await expect(page.locator('#inventory').getByRole('button', { name: 'Goldroot pickaxe', exact: true })).toBeVisible();
  await travel(page, 'Back to the wood', 'The Whispering Wood');
  await travel(page, 'Orc encampment', 'The Orc Encampment');

  // Approach without an item first so testing the timing window excludes travel time.
  await target(page, 'Stew cauldron');
  await speech(page, 'sleeping potion'); await dismiss(page);
  // Observe a complete transition so there is a full watching window to attempt the failure.
  await expect(page.locator('#guard-status')).toContainText('Guard looking away');
  await expect(page.locator('#guard-status')).toContainText('Guard watching');
  await inventory(page, 'Dreamcap stout');
  await target(page, 'Stew cauldron');
  await speech(page, 'He is watching!');
  await expect(page.locator('#inventory').getByRole('button', { name: 'Dreamcap stout', exact: true })).toBeVisible();
  await dismiss(page);
  await expect(page.locator('#guard-status')).toContainText('Guard looking away');
  await target(page, 'Stew cauldron');
  await speech(page, 'Grub falls asleep'); await dismiss(page);
  await expect(page.locator('#guard-status')).toContainText('Grub is sound asleep');
  await expect(page.locator('#inventory').getByRole('button', { name: 'Dreamcap stout', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('camp-guard-asleep.png'), fullPage: true });

  await inventory(page, 'Goldroot pickaxe');
  await target(page, 'King Aldric’s cage');
  await speech(page, 'secure a rope'); await dismiss(page);
  await page.getByRole('button', { name: 'Put away ×', exact: true }).click();
  await inventory(page, 'Climbing rope');
  await target(page, 'King Aldric’s cage');
  await speech(page, 'The rope is secure'); await dismiss(page);
  await inventory(page, 'Goldroot pickaxe');
  await target(page, 'King Aldric’s cage');
  await expect(page.locator('#cutscene')).toBeVisible();
  await expect(page.locator('#cutscene-kicker')).toHaveText('THE JOURNEY HOME');
  await expectCastMotion(page);
  await page.screenshot({ path: testInfo.outputPath('animated-rescue.png'), fullPage: true });
  for (let index = 0; index < 4; index++) await page.locator('#cutscene-next').click();
  await expectCinematicCleanup(page);
  await expect(page.getByRole('dialog')).toContainText('A king home. A hero made.');
  await page.getByRole('button', { name: 'Return to Bramblehollow', exact: true }).click();
  await expect(page.locator('#room-name')).toHaveText('Bramblehollow');
  await expect(page.locator('#objective')).toHaveText('King Aldric is home. Well done, Borin.');
  await page.screenshot({ path: testInfo.outputPath('king-rescued.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('save and reload restores an active dialog choice and inventory across a fresh page', async ({ page }, testInfo) => {
  await ready(page);
  await supplies(page);
  await travel(page, 'The Copper Tankard', 'The Copper Tankard');
  await target(page, 'Mara the innkeeper');
  await speech(page);
  await page.locator('#dialog-next').click();
  await expect(page.getByRole('button', { name: 'How do I get past an orc guard?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'save slot 1', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Adventure saved in slot 1');
  await page.getByRole('button', { name: 'How do I get past an orc guard?', exact: true }).click();
  await speech(page, 'sleep for hours'); await dismiss(page);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'load slot 1', exact: true }).click();
  await expect(page.locator('#room-name')).toHaveText('The Copper Tankard');
  await expect(page.locator('#cutscene')).toBeHidden();
  await expect(page.getByRole('button', { name: 'How do I get past an orc guard?', exact: true })).toBeVisible();
  await expect(page.locator('#inventory').getByRole('button', { name: 'Copper coin', exact: true })).toBeVisible();
  await expect(page.locator('#inventory').getByRole('button', { name: 'Climbing rope', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'How do I get past an orc guard?', exact: true }).click();
  await speech(page, 'sleep for hours'); await dismiss(page);
  await page.screenshot({ path: testInfo.outputPath('dialog-save-restored.png'), fullPage: true });
});

test('phone viewport keeps the story, nearby controls, and inventory usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, false);
  await expect(page.locator('#cutscene-next')).toBeInViewport();
  const bounds = await page.evaluate(() => {
    const stage = document.querySelector('.stage-wrap')!.getBoundingClientRect();
    const shell = document.querySelector('.game-shell')!.getBoundingClientRect();
    const text = document.querySelector('#cutscene-text')!.getBoundingClientRect();
    const next = document.querySelector('#cutscene-next')!.getBoundingClientRect();
    return { stageRight: stage.right, shellRight: shell.right, textRight: text.right, nextRight: next.right };
  });
  expect(bounds.stageRight).toBeLessThanOrEqual(bounds.shellRight);
  expect(bounds.textRight).toBeLessThanOrEqual(bounds.stageRight);
  expect(bounds.nextRight).toBeLessThanOrEqual(bounds.stageRight);
  await page.screenshot({ path: testInfo.outputPath('mobile-intro.png'), fullPage: true });
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await travel(page, 'My cottage', 'Borin’s Cottage');
  await target(page, 'Copper coin');
  await speech(page, 'One copper coin'); await dismiss(page);
  await inventory(page, 'Copper coin');
  await expect(page.locator('#inventory').getByRole('button', { name: 'Copper coin', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('mobile-cottage.png'), fullPage: true });
});

test('the player produces visible pixels above the room background with walk-behind masks active', async ({ page }, testInfo) => {
  await ready(page);
  // Object-state assertions missed a Phaser 4 WebGL mask covering the entire room.
  // Pausing updates freezes particles/NPC animation while render frames continue.
  await page.evaluate(() => {
    const demo = (window as unknown as { pointleshDemo: { scene: { scene: { pause(): void } } } }).pointleshDemo;
    demo.scene.scene.pause();
  });
  const canvas = page.locator('#game canvas');
  const visible = await canvas.screenshot({ path: testInfo.outputPath('visible-player.png') });
  await page.evaluate(() => {
    const demo = (window as unknown as { pointleshDemo: { scene: { actor: { setVisible(value: boolean): void } } } }).pointleshDemo;
    demo.scene.actor.setVisible(false);
  });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const hidden = await canvas.screenshot();
  expect(hidden.equals(visible), 'Hiding the player must change rendered pixels; a full-room mask must not conceal it').toBe(false);
});

test('live prefab property edits reach the character controller and support undo', async ({ page }, testInfo) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#cutscene')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/tools-visible/);
  await expectCinematicCleanup(page);
  await page.getByRole('button', { name: 'Toggle Adventure', exact: true }).click();
  await page.getByRole('combobox', { name: 'Adventure entity', exact: true }).selectOption('village.borin');
  const step = page.getByRole('spinbutton', { name: 'Pixels per animation frame', exact: true });
  await expect(step).toHaveValue('16');
  await step.fill('9'); await step.press('Tab');
  await expect.poll(() => page.evaluate(() => (window as unknown as { pointleshDemo: { scene: { character: { config: { walkStep: number } } } } }).pointleshDemo.scene.character.config.walkStep)).toBe(9);
  const courage = page.getByRole('spinbutton', { name: 'Courage', exact: true });
  await courage.fill('42'); await courage.press('Tab');
  await expect(courage).toHaveValue('42');
  const inspector = page.getByRole('region', { name: 'Pointlesh adventure properties', exact: true });
  const pendingDownload = page.waitForEvent('download');
  await inspector.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await pendingDownload;
  const manifest = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const player = manifest.scenes.village.layers.flatMap((layer: { prefabs: { id: string }[] }) => layer.prefabs).find((instance: { id: string }) => instance.id === 'village.borin');
  expect(player.pointlesh.properties.courage).toBe(42);
  expect(player.overrides.walkStep.value).toBe(9);
  expect(manifest.prefabs['forest.rescue-character'].pointlesh.behaviors).toContain('forest.rescue');
  await inspector.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(courage).toHaveValue('10');
  await inspector.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(step).toHaveValue('16');
  await expect.poll(() => page.evaluate(() => (window as unknown as { pointleshDemo: { scene: { character: { config: { walkStep: number } } } } }).pointleshDemo.scene.character.config.walkStep)).toBe(16);
  await page.screenshot({ path: testInfo.outputPath('live-prefab-inspector.png'), fullPage: true });
});
