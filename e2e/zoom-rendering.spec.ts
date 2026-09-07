import { expect, test } from '@playwright/test';

test('masked room foreground matches the background exactly through fractional camera transforms', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const comparisons = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.sys.pause();
    if (!scene.overlays.length) throw new Error('The test requires an actual foreground overlay');
    for (const object of scene.children.list) {
      if (object !== scene.background && !scene.overlays.some((overlay: any) => overlay.image === object)) object.setVisible?.(false);
    }
    const pixels = async () => {
      const image = await new Promise<HTMLImageElement>(resolve => scene.renderer.snapshot(resolve));
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const cases = [
      ...[1, 1.005, 1.01, 1.018, 1.024, 1.035, 1.05, 1.2].map(zoom => ({ zoom, zoomY: zoom, x: 0, y: 0, originX: .5, originY: .5, rotation: 0 })),
      { zoom: 1.005, zoomY: 1.005, x: 17.3, y: 9.6, originX: .5, originY: .5, rotation: 0 },
      { zoom: 1.018, zoomY: 1.018, x: -8.4, y: 13.2, originX: .25, originY: .7, rotation: 0 },
      { zoom: 1.018, zoomY: 1.031, x: 17.3, y: 9.6, originX: .4, originY: .6, rotation: .035 },
    ];
    const results = [];
    for (const transform of cases) {
      scene.cameras.main.setZoom(transform.zoom, transform.zoomY).setScroll(transform.x, transform.y).setOrigin(transform.originX, transform.originY).setRotation(transform.rotation);
      scene.overlays.forEach((overlay: any) => overlay.image.setVisible(false));
      const background = await pixels();
      scene.overlays.forEach((overlay: any) => overlay.image.setVisible(true));
      const composite = await pixels();
      let differingPixels = 0;
      for (let index = 0; index < background.length; index += 4) {
        if (background[index] !== composite[index] || background[index + 1] !== composite[index + 1] || background[index + 2] !== composite[index + 2] || background[index + 3] !== composite[index + 3]) differingPixels++;
      }
      results.push({ ...transform, differingPixels });
    }
    return results;
  });
  // A masked duplicate must add no visible pixels when no actors are behind it.
  // Previously the ordinary demo zoom produced over 11,000 changed pixels.
  for (const comparison of comparisons) expect(comparison.differingPixels, JSON.stringify(comparison)).toBe(0);
  expect(errors).toEqual([]);
});

test('aligned foreground still occludes by polygon and depth, and responds to its role toggle', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const result = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.sys.pause();
    const overlay = scene.overlays[0];
    for (const object of scene.children.list) if (object !== scene.background && object !== overlay.image) object.setVisible?.(false);
    scene.cameras.main.setZoom(1.018).setScroll(17.3, 9.6);
    const area = {
      ...scene.resolved().areas[0], kind: 'area', enabled: true, closed: true,
      polygon: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }],
      properties: { walkBehindEnabled: true, baseline: 505 },
    };
    overlay.sync(area);
    const probe = scene.add.rectangle(150, 150, 30, 30, 0xff00ff).setDepth(400);
    const magentaPixels = async () => {
      const image = await new Promise<HTMLImageElement>(resolve => scene.renderer.snapshot(resolve));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] === 255 && pixels[index + 1] === 0 && pixels[index + 2] === 255) count++;
      return count;
    };
    const behind = await magentaPixels();
    probe.setDepth(600);
    const inFront = await magentaPixels();
    probe.setDepth(400).setPosition(500, 400);
    const outside = await magentaPixels();
    probe.setPosition(150, 150);
    overlay.sync({ ...area, properties: { ...area.properties, walkBehindEnabled: false } });
    const disabled = await magentaPixels();
    return { behind, inFront, outside, disabled, visible: overlay.image.visible };
  });
  expect(result.behind).toBe(0);
  expect(result.inFront).toBeGreaterThan(500);
  expect(result.outside).toBeGreaterThan(500);
  expect(result.disabled).toBeGreaterThan(500);
  expect(result.visible).toBe(false);
});
