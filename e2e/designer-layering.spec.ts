import { expect, test } from '@playwright/test';

test('designer drawings sit above visible game controls, keep drag priority and leave simulation running', async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  const scenes = page.getByRole('button', { name: 'Toggle scene designer', exact: true });
  await expect(scenes).toHaveAttribute('aria-expanded', 'true');
  const hotspots = page.locator('#hotspots');
  await expect(hotspots).toBeVisible();
  await expect(hotspots).toHaveJSProperty('inert', false);
  const frame = () => page.evaluate(() => (window as any).pointleshDemo.scene.actor.frame.name);
  const initialFrame = await frame();
  await expect.poll(frame).not.toBe(initialFrame);

  // Opening the editor must not cancel an existing walk.
  await scenes.click();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    void scene.character.walkTo({ x: 240, y: 465 }, scene.walkables());
  });
  const position = () => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x);
  const initialX = await position();
  await scenes.click();
  await expect.poll(position).toBeLessThan(initialX - 30);

  await page.getByRole('button', { name: 'Expand layer', exact: true }).click();
  await page.getByText('Foreground occlusion', { exact: true }).click();
  // Move the floating properties panel away from the game button under test.
  const title = (await page.locator('.scene-designer__panel[data-panel="scenes"] .scene-designer__title').boundingBox())!;
  await page.mouse.move(title.x + 20, title.y + 8); await page.mouse.down();
  await page.mouse.move(220, title.y + 8, { steps: 8 }); await page.mouse.up();
  const baseline = page.getByRole('spinbutton', { name: 'Baseline', exact: true });
  const bounds = (await hotspots.boundingBox())!;
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const worldY = await page.evaluate(({ x, y }) => {
    const scene = (window as any).pointleshDemo.scene;
    const rect = scene.game.canvas.getBoundingClientRect();
    return Math.round(scene.cameras.main.getWorldPoint((x - rect.left) * scene.scale.width / rect.width, (y - rect.top) * scene.scale.height / rect.height).y);
  }, start);
  await baseline.fill(String(worldY)); await baseline.press('Tab');
  const layer = page.locator('.pointlesh-designer-layer');
  await expect(layer).toBeVisible();
  await expect.poll(() => layer.evaluate((element: HTMLCanvasElement, point) => {
    const rect = element.getBoundingClientRect();
    const pixel = element.getContext('2d')!.getImageData(Math.floor((point.x - rect.left) * element.width / rect.width), Math.floor((point.y - rect.top) * element.height / rect.height), 1, 1).data;
    element.style.pointerEvents = 'auto';
    const aboveButton = document.elementFromPoint(point.x, point.y) === element;
    element.style.pointerEvents = 'none';
    return aboveButton && pixel[0] > 200 && pixel[2] > 150 && pixel[3] > 200;
  }, start)).toBe(true);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x, start.y - 35, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => Number(await baseline.inputValue())).toBeLessThan(worldY - 15);
  await expect(hotspots).not.toHaveClass(/active/);
  await expect(hotspots).toBeVisible();

  // Native polygon vertices must also win over the HTML button (Phaser uses mouse events).
  await page.getByRole('button', { name: 'Edit shape', exact: true }).click();
  const vertex = await page.evaluate(point => {
    const scene = (window as any).pointleshDemo.scene;
    const designer = scene.sceneDesigner.designer;
    const instance = designer.getManifest().scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.foreground');
    const id = instance.overrides.area.vertices[1].id;
    const rect = scene.game.canvas.getBoundingClientRect();
    const world = scene.cameras.main.getWorldPoint((point.x - rect.left) * scene.scale.width / rect.width, (point.y - rect.top) * scene.scale.height / rect.height);
    designer.updateAreaVertex('village.foreground::area', id, { x: world.x, y: world.y });
    return { id, x: world.x };
  }, start);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x - 35, start.y - 20, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(id => {
    const manifest = (window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest();
    return manifest.scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.foreground').overrides.area.vertices.find((vertex: any) => vertex.id === id).x;
  }, vertex.id)).toBeLessThan(vertex.x - 15);
  await expect(hotspots).not.toHaveClass(/active/);

  await scenes.click();
  await expect(layer).toBeHidden();
  await hotspots.click();
  await expect(hotspots).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await expect(hotspots).toBeVisible();
  await expect(layer).toBeHidden();
  await scenes.click();
  await expect(layer).toBeVisible();
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.destroy());
  await expect(layer).toHaveCount(0);
  await expect(hotspots).toBeVisible();
});

test('opening Scenes keeps the animated cutscene and its controls running', async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#cutscene')).toBeVisible();
  await page.locator('#designer').click();
  await expect(page.getByRole('button', { name: 'Toggle scene designer', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#cutscene')).toBeVisible();
  await expect(page.locator('#cutscene-next')).toBeVisible();
  const time = () => page.evaluate(() => {
    const checkpoint = (window as any).pointleshDemo.scene.introRunner.snapshot();
    return { step: checkpoint.stepIndex, elapsed: checkpoint.elapsedMs };
  });
  const before = await time();
  await expect.poll(async () => {
    const after = await time();
    return after.step > before.step || after.elapsed > before.elapsed + 200;
  }).toBe(true);
});
