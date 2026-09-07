import { expect, test, type Page } from '@playwright/test';

async function worldScreen(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const scene = (window as any).pointleshDemo.scene, camera = scene.cameras.main;
    const bounds = scene.game.canvas.getBoundingClientRect();
    return {
      x: bounds.left + ((x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2) * bounds.width / camera.width,
      y: bounds.top + ((y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2) * bounds.height / camera.height,
    };
  }, { x, y });
}

async function baselineVisible(page: Page) {
  return page.evaluate(() => !!(window as any).pointleshDemo.scene.children.getByName('pointlesh-area-baseline')?.visible);
}

async function dragBaseline(page: Page, from: number, to: number) {
  const start = await worldScreen(page, 420, from), end = await worldScreen(page, 420, to);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
}

test('native area selection exposes Walk-behind and a live baseline with one undo per drag', async ({ page }, testInfo) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const native = page.locator('.scene-designer__panel[data-panel="scenes"]');
  await native.getByRole('button', { name: 'Expand layer', exact: true }).click();
  await native.getByText('Foreground occlusion', { exact: true }).click();
  const context = native.getByRole('region', { name: 'Selected area adventure properties' });
  const enabled = context.getByRole('checkbox', { name: 'Walk-behind', exact: true });
  await expect(enabled).toBeChecked();
  const baseline = context.getByRole('spinbutton', { name: 'Baseline', exact: true });
  const original = Number(await baseline.inputValue());
  await expect.poll(() => baselineVisible(page)).toBe(true);
  await enabled.uncheck();
  await expect.poll(() => baselineVisible(page)).toBe(false);
  await expect(baseline).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.overlays.length)).toBe(0);
  await context.getByRole('button', { name: 'Undo area edit', exact: true }).click();
  await expect(enabled).toBeChecked();
  await expect.poll(() => baselineVisible(page)).toBe(true);

  await native.getByRole('button', { name: 'Edit shape', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getSelection())).toMatchObject({ type: 'area', areaId: 'village.foreground::area' });
  await dragBaseline(page, original, original - 70);
  // Live occlusion updates before pointerup, while history still has only the initial checkpoint.
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.overlays[0]?.image.depth)).toBeCloseTo(original - 70, 0);
  await page.mouse.up();
  const changed = Number(await baseline.inputValue());
  expect(changed).toBeCloseTo(original - 70, 0);
  await context.getByRole('button', { name: 'Undo area edit', exact: true }).click();
  await expect(baseline).toHaveValue(String(original));
  await context.getByRole('button', { name: 'Redo area edit', exact: true }).click();
  await expect(baseline).toHaveValue(String(changed));
  const exported = await page.evaluate(() => JSON.parse((window as any).pointleshDemo.scene.sceneDesigner.inspector.exportManifest()));
  const instance = exported.scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.foreground');
  expect(instance.overrides.baseline.value).toBe(changed);
  expect(instance.pointlesh.properties.walkBehindEnabled).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('native-walk-behind-baseline.png'), fullPage: true });

  // A native vertex keeps input priority even where it sits on the baseline.
  const vertex = instance.overrides.area.vertices[1];
  await baseline.fill(String(vertex.y)); await baseline.press('Tab');
  const vertexStart = await worldScreen(page, vertex.x, vertex.y);
  const vertexEnd = await worldScreen(page, vertex.x + 25, vertex.y + 20);
  await page.mouse.move(vertexStart.x, vertexStart.y); await page.mouse.down();
  await page.mouse.move(vertexEnd.x, vertexEnd.y, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.manifest.scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.foreground').overrides.area.vertices[1].x)).toBeGreaterThan(vertex.x + 15);
  await expect(baseline).toHaveValue(String(vertex.y));

  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await expect.poll(() => baselineVisible(page)).toBe(false);
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await expect.poll(() => baselineVisible(page)).toBe(true);
  await page.setViewportSize({ width: 703, height: 900 });
  await expect.poll(() => page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const label = scene.children.getByName('pointlesh-area-baseline-label');
    return parseFloat(label.style.fontSize) * label.scaleY * scene.cameras.main.zoom * scene.game.canvas.getBoundingClientRect().height / scene.scale.height;
  })).toBeCloseTo(12, 1);
  await page.screenshot({ path: testInfo.outputPath('narrow-walk-behind-baseline.png'), fullPage: true });
});

test('prefab defaults expose the same Walk-behind controls and baseline without changing instance overrides', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  const native = page.locator('.scene-designer__panel[data-panel="prefabs"]');
  await native.locator(':scope > .scene-designer__section select').selectOption('pointlesh.area');
  const context = native.getByRole('region', { name: 'Selected area adventure properties' });
  await context.getByRole('checkbox', { name: 'Walk-behind', exact: true }).check();
  const baseline = context.getByRole('spinbutton', { name: 'Baseline', exact: true });
  const initial = Number(await baseline.inputValue());
  await expect.poll(() => baselineVisible(page)).toBe(true);
  await dragBaseline(page, initial, initial + 40);
  await page.mouse.up();
  await expect(baseline).toHaveValue(String(initial + 40));
  const manifest = await page.evaluate(() => (window as any).pointleshDemo.manifest);
  expect(manifest.prefabs['pointlesh.area'].attributes.find((attribute: any) => attribute.id === 'baseline').number.value).toBe(initial + 40);
  expect(manifest.scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.foreground').overrides.baseline.value).not.toBe(initial + 40);
  await context.getByRole('button', { name: 'Undo area edit', exact: true }).click();
  await expect(baseline).toHaveValue(String(initial));
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.areaBaseline.destroy());
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.children.getByName('pointlesh-area-baseline'))).toBeNull();
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.inspector.destroy());
  await expect(native.getByRole('region', { name: 'Selected area adventure properties' })).toHaveCount(0);
  await expect(native.getByRole('spinbutton', { name: 'Baseline', exact: true })).toBeVisible();
});

test('inline area undo restores the entire offscreen vertex drag', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const before = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('house');
    scene.sceneDesigner.designer.select({ type: 'area', sceneId: 'house', layerId: 'house.adventure', areaId: 'house.foreground::area' });
    scene.cameras.main.setZoom(1.035);
    return scene.sceneDesigner.designer.getManifest();
  });
  const grip = page.locator('.pointlesh-area-edge-handle[data-area-id="house.foreground::area"][data-vertex-id="foreground-0"]');
  await expect(grip).toBeVisible();
  const bounds = (await grip.boundingBox())!;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(center.x, center.y); await page.mouse.down();
  await page.mouse.move(center.x + 80, center.y - 30, { steps: 12 }); await page.mouse.up();
  const after = await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest());
  expect(after).not.toEqual(before);
  const context = page.getByRole('region', { name: 'Selected area adventure properties' });
  await context.getByRole('button', { name: 'Undo area edit', exact: true }).click();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest())).toEqual(before);
  await context.getByRole('button', { name: 'Redo area edit', exact: true }).click();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getManifest())).toEqual(after);
});

test('inline area controls remain clickable where a scrolled dock resize grip crosses them', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const native = page.locator('.scene-designer__panel[data-panel="scenes"]');
  await native.getByRole('button', { name: 'Expand layer', exact: true }).click();
  await native.getByText('Foreground occlusion', { exact: true }).click();
  const context = native.getByRole('region', { name: 'Selected area adventure properties' });
  const enabled = context.getByRole('checkbox', { name: 'Walk-behind', exact: true });
  await enabled.uncheck();
  const undo = context.getByRole('button', { name: 'Undo area edit', exact: true });
  await undo.scrollIntoViewIfNeeded();
  // The upstream dock mounts its absolute resize grips inside the scrolling panel.
  // Choose a window height that puts its south grip across the Undo button, then
  // scroll both into the middle of the panel, reproducing the Linux layout failure.
  const heightAdjustment = await native.evaluate(panel => {
    const button = panel.querySelector('.pointlesh-native-area-history button')!.getBoundingClientRect();
    const grip = panel.querySelector('[data-edge="s"]')!.getBoundingClientRect();
    return button.y + button.height / 2 - grip.y - grip.height / 2;
  });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ ...viewport, height: Math.round(viewport.height + heightAdjustment) });
  await native.evaluate(panel => { panel.scrollTop += 300; });
  const overlaps = await native.evaluate(panel => {
    const button = panel.querySelector('.pointlesh-native-area-history button')!.getBoundingClientRect();
    const grip = panel.querySelector('[data-edge="s"]')!.getBoundingClientRect();
    const x = button.x + button.width / 2, y = button.y + button.height / 2;
    return x >= grip.left && x <= grip.right && y >= grip.top && y <= grip.bottom;
  });
  expect(overlaps).toBe(true);
  await undo.click({ timeout: 10_000 });
  await expect(enabled).toBeChecked();
});
