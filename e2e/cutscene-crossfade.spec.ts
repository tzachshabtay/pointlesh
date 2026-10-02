import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

for (const [width, finish] of [[1440, 'natural'], [390, 'skip']] as const) {
  test(`intro dissolves into playable game at ${width}px (${finish})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    // Hold the real browser animation so both endpoints and its midpoint can be
    // inspected without relying on a screenshot arriving within 700ms.
    await page.addInitScript(() => new MutationObserver(() => {
      for (const image of document.querySelectorAll('.cutscene-crossfade, #cinematic-portrait')) {
        for (const animation of image.getAnimations()) animation.pause();
      }
    }).observe(document, { childList: true, subtree: true }));
    await openAdventure(page);
    const before = await page.evaluate(finish => {
      const scene = (window as any).pointleshDemo.scene;
      scene.scene.pause();
      scene.story.introStep = 3;
      scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex: 3, elapsedMs: 8400 });
      scene.renderCutscene();
      const position = { ...scene.character.state.position };
      const world = scene.children.getByName('pointlesh-cinematic').list[0];
      const cast = ['borin', 'elder'].map(id => {
        const sprite = world.getByName('cinematic-' + id), matrix = sprite.getWorldTransformMatrix();
        return { id, position: { x: sprite.x, y: sprite.y }, screen: { x: matrix.tx, y: matrix.ty } };
      });
      if (finish === 'natural') scene.update(0, 100);
      else scene.advanceCutscene(true);
      return { position, cast };
    }, finish);
    const image = page.locator('.cutscene-crossfade');
    await expect(image).toBeVisible();
    const captured = await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene;
      const image = document.querySelector('.cutscene-crossfade') as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 90) lit++;
      return { width: image.naturalWidth, height: image.naturalHeight, canvasWidth: scene.game.canvas.width, canvasHeight: scene.game.canvas.height, lit, blocked: scene.blocked(),
        cinematic: !!scene.cinematic, fade: image.getAnimations()[0]!.effect!.getTiming().duration };
    });
    expect(captured).toMatchObject({ blocked: true, cinematic: false, fade: 700 });
    expect(captured.width).toBe(captured.canvasWidth); expect(captured.height).toBe(captured.canvasHeight);
    expect(captured.lit).toBeGreaterThan(captured.width * captured.height * .1);
    const gameplay = await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene, camera = scene.cameras.main;
      const elder = [...scene.npcActors.values()].find((npc: any) => npc.actorName === 'elder') as any;
      return [['borin', scene.actor], ['elder', elder.sprite]].map(([id, sprite]: any) => ({ id,
        position: { x: sprite.x, y: sprite.y }, screen: {
          x: 480 * (1 - camera.zoom) - camera.scrollX * camera.zoom + sprite.x * camera.zoom,
          y: 270 * (1 - camera.zoom) - camera.scrollY * camera.zoom + sprite.y * camera.zoom,
        } }));
    });
    for (let i = 0; i < gameplay.length; i++) {
      expect(gameplay[i]!.position).toEqual(before.cast[i]!.position);
      expect(gameplay[i]!.screen.x).toBeCloseTo(before.cast[i]!.screen.x, 4);
      expect(gameplay[i]!.screen.y).toBeCloseTo(before.cast[i]!.screen.y, 4);
    }
    const stage = (await page.locator('.stage-wrap').boundingBox())!, overlay = (await image.boundingBox())!;
    expect(Math.abs(stage.width - overlay.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(stage.height - overlay.height)).toBeLessThanOrEqual(2);
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('.cutscene-crossfade, #cinematic-portrait')) {
        for (const animation of node.getAnimations()) animation.currentTime = 350;
      }
    });
    await expect(image).toHaveCSS('opacity', '0.5');
    await expect(page.locator('#cinematic-portrait')).toHaveCSS('opacity', '0.5');
    await page.screenshot({ path: testInfo.outputPath('crossfade-midpoint.png') });
    await image.evaluate(node => node.getAnimations()[0]!.finish());
    await expect(image).toHaveCount(0);
    await expect(page.locator('#cinematic-portrait')).toBeHidden();
    const resumed = await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene;
      return { blocked: scene.blocked(), position: scene.character.state.position, introStep: scene.story.introStep };
    });
    expect(resumed).toEqual({ blocked: false, position: before.position, introStep: 4 });
  });
}

test('loading during the dissolve cancels its overlay and restores normal input', async ({ page }) => {
  await openAdventure(page);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.scene.pause(); scene.advanceCutscene(true);
  });
  await expect(page.locator('.cutscene-crossfade')).toBeVisible();
  const state = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.restore(scene.snapshot());
    return { blocked: scene.blocked(), cinematic: !!scene.cinematic };
  });
  expect(state).toEqual({ blocked: false, cinematic: false });
  await expect(page.locator('.cutscene-crossfade')).toHaveCount(0);
  await expect(page.locator('#inventory')).toBeVisible();
  await page.evaluate(() => (window as any).pointleshDemo.scene.newGame());
  await expect(page.locator('#cutscene')).toBeVisible();
  await expect(page.locator('.cutscene-crossfade')).toHaveCount(0);
});
