import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

const holdDissolve = () => new MutationObserver(() => {
  for (const image of document.querySelectorAll('.cutscene-crossfade, #cinematic-portrait')) {
    for (const animation of image.getAnimations()) animation.pause();
  }
}).observe(document, { childList: true, subtree: true });

for (const [width, skip] of [[1440, false], [390, true]] as const) test(`camp crossfade reveals normal gameplay at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.addInitScript(holdDissolve);
  await openAdventure(page);
  await page.evaluate(skip => {
    const scene = (window as any).pointleshDemo.scene;
    scene.scene.pause(); scene.story.introStep = 2;
    scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex: 2, elapsedMs: 5900 });
    scene.renderCutscene(); scene.advanceCutscene(skip);
  }, skip);
  const image = page.locator('.cutscene-crossfade');
  await expect(image).toBeVisible();
  const state = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const image = document.querySelector('.cutscene-crossfade') as HTMLImageElement;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 90) lit++;
    return { blocked: scene.blocked(), cinematic: !!scene.cinematic, duration: image.getAnimations()[0]!.effect!.getTiming().duration,
      width: image.naturalWidth, canvasWidth: scene.game.canvas.width, lit, pixels: canvas.width * canvas.height,
      arrival: scene.introArrival ?? null, phase: scene.roomTransition.phase ?? null };
  });
  expect(state).toMatchObject({ blocked: true, cinematic: false, duration: 700, arrival: skip ? null : 'walking', phase: skip ? null : 'opening-entry' });
  expect(state.width).toBe(state.canvasWidth); expect(state.lit).toBeGreaterThan(state.pixels * .1);
  const stage = (await page.locator('.stage-wrap').boundingBox())!, overlay = (await image.boundingBox())!;
  expect(Math.abs(stage.width - overlay.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(stage.height - overlay.height)).toBeLessThanOrEqual(2);
  await image.evaluate(node => { node.getAnimations()[0]!.currentTime = 350; });
  await expect(image).toHaveCSS('opacity', '0.5');
  await page.screenshot({ path: testInfo.outputPath('camp-to-village-midpoint.png') });
  await image.evaluate(node => node.getAnimations()[0]!.finish());
  await expect(image).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.blocked())).toBe(!skip);
});

test('loading during the dissolve cancels its overlay and resumes the saved gameplay entrance', async ({ page }) => {
  await page.addInitScript(holdDissolve); await openAdventure(page);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.scene.pause(); scene.story.introStep = 2;
    scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex: 2, elapsedMs: 5900 });
    scene.renderCutscene(); scene.advanceCutscene();
  });
  await expect(page.locator('.cutscene-crossfade')).toBeVisible();
  const state = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.restore(scene.snapshot());
    return { cinematic: !!scene.cinematic, arrival: scene.introArrival, phase: scene.roomTransition.phase };
  });
  expect(state).toEqual({ cinematic: false, arrival: 'walking', phase: 'opening-entry' });
  await expect(page.locator('.cutscene-crossfade')).toHaveCount(0);
  await expect(page.locator('#inventory')).toBeVisible();
});
