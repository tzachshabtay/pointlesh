import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 626, height: 950 }, deviceScaleFactor: 2 });

test('high-DPI rendering keeps sprite detail, room framing, walking and designer coordinates stable through resize', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  const resolution = () => page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene, c = s.game.canvas, rect = c.getBoundingClientRect();
    return { actual: [c.width, c.height], expected: [Math.round(rect.width * devicePixelRatio), Math.round(rect.height * devicePixelRatio)], logical: [s.scale.gameSize.width, s.scale.gameSize.height], camera: [s.cameras.main.width, s.cameras.main.height] };
  });
  for (const width of [626, 1000, 626]) {
    await page.setViewportSize({ width, height: 950 });
    await expect.poll(async () => { const r = await resolution(); return r.actual.toString() === r.expected.toString(); }).toBe(true);
    expect(await resolution()).toMatchObject({ logical: [960, 540], camera: [960, 540] });
  }
  const before = await page.evaluate(() => ({ ...(window as any).pointleshDemo.scene.character.state.position }));
  const target = { x: before.x + 85, y: before.y };
  const click = await page.evaluate(target => {
    const s = (window as any).pointleshDemo.scene, c = s.cameras.main, rect = s.game.canvas.getBoundingClientRect();
    const point = c.matrixCombined.transformPoint(target.x, target.y);
    return { x: rect.left + point.x * rect.width / 960, y: rect.top + point.y * rect.height / 540 };
  }, target);
  await page.mouse.click(click.x, click.y);
  await expect.poll(() => page.evaluate(target => Math.hypot((window as any).pointleshDemo.scene.character.state.position.x - target.x, (window as any).pointleshDemo.scene.character.state.position.y - target.y), target)).toBeLessThan(3);
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  expect(await resolution()).toMatchObject({ logical: [960, 540], camera: [960, 540] });
  await expect(page.locator('.pointlesh-designer-layer')).toHaveJSProperty('width', 960);
  await expect(page.locator('.pointlesh-designer-layer')).toHaveJSProperty('height', 540);
  await page.screenshot({ path: testInfo.outputPath('high-dpi-designer.png') });
  expect(errors).toEqual([]);
});

test('high-DPI walk-behind samples match the room through fractional camera transforms', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const differences = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.sys.pause();
    for (const object of scene.children.list) if (object !== scene.background && !scene.overlays.some((overlay: any) => overlay.image === object)) object.setVisible?.(false);
    const pixels = async () => {
      const image = await new Promise<HTMLImageElement>(resolve => scene.renderer.snapshot(resolve));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const differences = [];
    for (const zoom of [1, 1.0115, 1.2]) {
      scene.cameras.main.setZoom(zoom).setScroll(17.3, 9.6);
      scene.overlays.forEach((overlay: any) => overlay.image.setVisible(false));
      const background = await pixels();
      scene.overlays.forEach((overlay: any) => overlay.image.setVisible(true));
      const composite = await pixels();
      let count = 0;
      for (let i = 0; i < background.length; i++) if (background[i] !== composite[i]) count++;
      differences.push(count);
    }
    return differences;
  });
  expect(differences).toEqual([0, 0, 0]);
});
