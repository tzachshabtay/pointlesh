import { expect, test, type Page } from '@playwright/test';
import { cinematicView, expectCastMotion, expectCinematicCleanup } from './cinematic-helpers';

type DemoView = {
  scene: {
    character: { state: { position: { x: number; y: number }; facing: string; activity: string } };
    cameras: { main: { width: number; height: number; zoom: number; scrollX: number; scrollY: number } };
  };
};

async function begin(page: Page) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect(page.locator('#cutscene')).toBeHidden();
}

async function player(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { pointleshDemo: DemoView }).pointleshDemo.scene.character.state;
    return { ...state.position, facing: state.facing, activity: state.activity };
  });
}

async function worldClick(page: Page, x: number, y: number) {
  const screen = await page.evaluate(({ x, y }) => {
    const camera = (window as unknown as { pointleshDemo: DemoView }).pointleshDemo.scene.cameras.main;
    const canvas = document.querySelector('#game canvas')!.getBoundingClientRect();
    return {
      x: canvas.left + ((x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2) * canvas.width / camera.width,
      y: canvas.top + ((y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2) * canvas.height / camera.height,
    };
  }, { x, y });
  await page.mouse.click(screen.x, screen.y);
}

test('clicking above walkable ground walks to the nearest reachable boundary', async ({ page }, testInfo) => {
  await begin(page);
  const before = await player(page);
  await worldClick(page, 600, 200);
  await expect.poll(async () => (await player(page)).activity).toBe('walking');
  await expect.poll(async () => (await player(page)).y).toBeLessThan(before.y - 40);
  await expect.poll(async () => (await player(page)).activity).toBe('idle');
  const after = await player(page);
  // CSS-scaled pointer rounding and the settling camera can shift the click by a pixel.
  expect(Math.abs(after.x - 600)).toBeLessThan(2);
  expect(after.y).toBeCloseTo(355, 0);
  await expect(page.locator('#toast')).not.toContainText('clear path');
  await expect(page.locator('#dialog')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('nearest-walkable-boundary.png'), fullPage: true });
});

test('held arrows move continuously, stop at the floor edge, and stop on release', async ({ page }) => {
  await begin(page);
  // Clicking ordinary page text clears focus from the skipped cutscene button.
  await page.locator('#objective').click();
  const before = await player(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await player(page)).x).toBeGreaterThan(before.x + 60);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await player(page)).activity).toBe('idle');
  const released = await player(page);
  expect(released.facing).toBe('right');
  await page.waitForTimeout(250);
  const stopped = await player(page);
  expect(stopped.x).toBeCloseTo(released.x, 3);
  expect(stopped.y).toBeCloseTo(released.y, 3);

  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await player(page)).y).toBeLessThan(357);
  await page.waitForTimeout(300);
  const boundary = await player(page);
  expect(boundary.y).toBeGreaterThanOrEqual(354.9);
  expect(boundary.y).toBeLessThanOrEqual(356.9);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await player(page)).activity).toBe('idle');
  expect((await player(page)).facing).toBe('up');
});

test('arrow movement is suppressed while using designers and focused property inputs', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: 'Designer', exact: true }).click();
  const designerPosition = await player(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');
  const afterDesigner = await player(page);
  expect(afterDesigner.x).toBeCloseTo(designerPosition.x, 3);
  expect(afterDesigner.y).toBeCloseTo(designerPosition.y, 3);

  await page.getByRole('button', { name: 'Toggle Adventure', exact: true }).click();
  await page.getByRole('combobox', { name: 'Adventure entity', exact: true }).selectOption('village.borin');
  await page.getByRole('spinbutton', { name: 'Courage', exact: true }).focus();
  const inputPosition = await player(page);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowLeft');
  const afterInput = await player(page);
  expect(afterInput.x).toBeCloseTo(inputPosition.x, 3);
  expect(afterInput.y).toBeCloseTo(inputPosition.y, 3);
});

test('animated intro moves real sprites, restores a timed save checkpoint, and cleans up when skipped', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expectCastMotion(page);
  await page.screenshot({ path: testInfo.outputPath('animated-abduction.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = (await cinematicView(page))!;
  expect(saved.kind).toBe('intro');
  expect(saved.elapsedMs).toBeGreaterThan(100);
  await page.waitForTimeout(200);
  expect((await cinematicView(page))!.elapsedMs).toBe(saved.elapsedMs);
  await page.getByRole('button', { name: 'save slot 2', exact: true }).click();
  await page.locator('#cutscene-next').click();
  await expect.poll(async () => (await cinematicView(page))?.stepIndex).toBe(saved.stepIndex + 1);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'load slot 2', exact: true }).click();
  const restored = (await cinematicView(page))!;
  expect(restored.stepIndex).toBe(saved.stepIndex);
  expect(restored.elapsedMs).toBeGreaterThanOrEqual(saved.elapsedMs);
  expect(restored.elapsedMs).toBeLessThan(saved.elapsedMs + 350);
  for (const actor of saved.cast.filter(actor => actor.visible)) {
    const next = restored.cast.find(candidate => candidate.id === actor.id)!;
    expect(Math.hypot(next.x - actor.x, next.y - actor.y)).toBeLessThan(20);
  }
  await expectCastMotion(page);
  await expect.poll(async () => (await cinematicView(page))?.stepIndex, { timeout: 8_000 }).toBe(saved.stepIndex + 1);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect(page.locator('#cutscene')).toBeHidden();
  await expectCinematicCleanup(page);
  await expect(page.locator('#room-name')).toHaveText('Bramblehollow');
  expect(errors).toEqual([]);
});
