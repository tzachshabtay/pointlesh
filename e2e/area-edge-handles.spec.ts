import { expect, test } from '@playwright/test';

for (const farOutside of [false, true]) test(`${farOutside ? 'Distant' : 'Offscreen cottage'} vertices follow the visible grip only after dragging and use native undo`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const before = await page.evaluate(farOutside => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('house');
    const designer = scene.sceneDesigner.designer;
    designer.open();
    designer.select({ type: 'area', sceneId: 'house', layerId: 'house.adventure', areaId: 'house.foreground::area' });
    // Build the offscreen/curve fixture in memory without relying on the user's room edits.
    designer.updateAreaVertex('house.foreground::area', 'foreground-0', {
      x: farOutside ? -2000 : 0, y: 357,
      curve: farOutside ? { cx: -1970, cy: 368 } : undefined,
    }, { history: false });
    designer.updateAreaVertex('house.foreground::area', 'foreground-1', { curve: { cx: 84, cy: 387 } }, { history: false });
    scene.cameras.main.setZoom(1.035);
    return JSON.stringify(designer.getManifest());
  }, farOutside);
  const grip = page.locator('.pointlesh-area-edge-handle[data-area-id="house.foreground::area"][data-vertex-id="foreground-0"]');
  await expect(grip).toBeVisible();
  await expect(grip).toHaveText('');
  await expect(grip).toHaveCSS('background-color', 'rgb(16, 18, 22)');
  await expect(grip).toHaveCSS('border-top-color', 'rgb(255, 224, 138)');
  await expect(grip).toHaveAccessibleName(/Drag offscreen vertex 1/);
  let bounds = await grip.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeLessThan(20);
  let center = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
  expect(await page.evaluate(() => JSON.stringify((window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest()))).toBe(before);
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.up();
  expect(await page.evaluate(() => JSON.stringify((window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest()))).toBe(before);
  await expect(grip).toHaveCSS('background-color', 'rgb(255, 224, 138)');
  // Like native vertices, selecting enlarges the dot from radius 5 to 6.
  bounds = await grip.boundingBox();
  center = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };

  const original = await page.evaluate(() => (window as any).pointleshDemo.scene.resolved().areas.find((area: any) => area.id === 'house.foreground').polygon);
  // Grab away from the grip center: the vertex must follow the center, retaining
  // this small grab offset but discarding its original distance outside the view.
  await page.mouse.move(center.x + 2, center.y - 1); await page.mouse.down();
  expect(await page.evaluate(() => JSON.stringify((window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest()))).toBe(before);
  await page.mouse.move(center.x + 47, center.y - 13, { steps: 5 });
  await page.mouse.up();
  const after = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    return scene.sceneDesigner.designer.getManifest().scenes.house.layers[0].prefabs.find((instance: any) => instance.id === 'house.foreground').overrides.area.vertices;
  });
  expect(after[0].x).toBeGreaterThan(20);
  expect(after[0].y).toBeLessThan(357);
  expect(after[0].curve).toEqual(farOutside ? { cx: -1970, cy: 368 } : undefined);
  expect(after[1].curve).toEqual({ cx: 84, cy: 387 });
  const projected = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const vertex = scene.sceneDesigner.designer.getManifest().scenes.house.layers[0].prefabs.find((instance: any) => instance.id === 'house.foreground').overrides.area.vertices[0];
    const point = scene.cameras.main.matrixCombined.transformPoint(vertex.x, vertex.y);
    const canvas = scene.game.canvas, rect = canvas.getBoundingClientRect();
    return { x: rect.left + point.x * rect.width / canvas.width, y: rect.top + point.y * rect.height / canvas.height };
  });
  expect(projected.x).toBeCloseTo(center.x + 45, 1);
  expect(projected.y).toBeCloseTo(center.y - 12, 1);
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.undo());
  expect(await page.evaluate(() => JSON.stringify((window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest()))).toBe(before);
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.redo());
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.resolved().areas.find((area: any) => area.id === 'house.foreground').polygon)).not.toEqual(original);
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.close());
  await expect(page.locator('.pointlesh-area-edge-handle')).toHaveCount(0);
  expect(errors).toEqual([]);
});
