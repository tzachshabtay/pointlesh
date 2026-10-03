import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

for (const width of [1440, 390]) test(`cinematic bars occupy the game UI strips at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await openAdventure(page);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.scene.pause(); scene.cinematic.render(0, 2000);
  });
  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector)!;
      const { top, bottom, left, right } = element.getBoundingClientRect();
      return { top, bottom, left, right, background: getComputedStyle(element).backgroundColor };
    };
    const root = (window as any).pointleshDemo.scene.children.getByName('pointlesh-cinematic');
    return { stage: bounds('.stage-wrap'), top: bounds('.scene-bar'), bottom: bounds('.inventory-bar'),
      controls: bounds('#cutscene-next'), caption: bounds('.cinematic-caption'),
      canvasBorders: root.list.filter((child: any) => ['Graphics', 'Text'].includes(child.type)).length };
  });
  expect(layout.top.background).toBe('rgb(0, 0, 0)');
  expect(layout.bottom.background).toBe('rgb(0, 0, 0)');
  expect(layout.top.bottom).toBeLessThanOrEqual(layout.stage.top);
  expect(layout.bottom.top).toBeGreaterThanOrEqual(layout.stage.bottom);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.stage.top);
  expect(layout.caption.top).toBeGreaterThanOrEqual(layout.stage.bottom);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.stage.right);
  expect(layout.caption.right).toBeLessThanOrEqual(layout.stage.right);
  expect(layout.canvasBorders).toBe(0);
  for (const id of ['menu', 'map', 'journal']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#designer')).toBeVisible();
  await expect(page.locator('#inventory')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('cinematic-bars.png'), fullPage: true });
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect(page.locator('.cinematic-caption')).toBeHidden();
  await expect(page.locator('#inventory')).toBeVisible();
  await expect(page.locator('.scene-bar')).toHaveCSS('background-color', 'rgb(27, 41, 33)');
  await expect(page.locator('.inventory-bar')).toHaveCSS('background-color', 'rgb(28, 42, 34)');
  for (const id of ['menu', 'map', 'journal']) await expect(page.locator(`#${id}`)).toBeVisible();
});

test('production cutscenes hide the complete normal toolbar including Designer', async ({ page }, testInfo) => {
  test.skip(!process.env.POINTLESH_PRODUCTION_URL, 'Requires a built production preview');
  await page.goto(process.env.POINTLESH_PRODUCTION_URL!);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#cutscene')).toBeVisible();
  for (const id of ['menu', 'map', 'journal', 'designer']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#skip-intro')).toBeVisible();
  await expect(page.locator('#cutscene-next')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('production-cinematic-toolbar.png') });
});

test('the king faces front after the homecoming walk and retains that pose on load', async ({ page }, testInfo) => {
  await page.route('**/authoring/*.json', route => route.fulfill({ status: 404, body: '' }));
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await openAdventure(page);
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep(); scene.story.introStep = 3; scene.story.endingStep = 3;
    scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex: 3, elapsedMs: 0 });
    scene.endingRunner.restore({ cutsceneId: 'forest.ending', version: 1, stepIndex: 3, elapsedMs: 5400 });
    scene.renderCutscene();
    const king = () => scene.children.getByName('pointlesh-cinematic').list[0].getByName('cinematic-king');
    const pose = () => ({ x: king().x, y: king().y, animation: king().anims.currentAnim.key, frame: king().frame.name });
    const arrived = pose();
    scene.cinematic.render(3, 6100); const held = pose();
    scene.cinematic.render(3, 3000); const walking = pose();
    scene.renderCutscene(); scene.restore(scene.snapshot()); const restored = pose();
    scene.scene.pause(); scene.game.loop.wake();
    return { arrived, held, walking, restored };
  });
  expect(result.arrived.animation).toBe('king.idle-front');
  expect(result.held.animation).toBe('king.idle-front');
  expect(result.held.x).toBe(result.arrived.x); expect(result.held.y).toBe(result.arrived.y);
  expect(result.walking.animation).toMatch(/^king\.walk-/);
  expect(result.restored).toEqual(result.arrived);
  await page.screenshot({ path: testInfo.outputPath('king-homecoming.png') });
});
