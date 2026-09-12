import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1055, height: 1000 }, deviceScaleFactor: 2 });

test('browser canvas sampling at a fractional Retina display size preserves source colors', async ({ page }, testInfo) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.sceneDesigner.designer.close(); scene.sys.pause();
    for (const object of scene.children.list) object.setVisible?.(false);
    scene.cameras.main.setZoom(1).setScroll(0, 0);
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    for (let x = 0; x < 32; x++) { ctx.fillStyle = x % 2 ? '#ff0000' : '#0000ff'; ctx.fillRect(x, 0, 1, 32); }
    const texture = scene.textures.addCanvas('sampling-checker', canvas);
    texture.setSmoothPixelArt(false); texture.setFilter(1);
    scene.add.image(240, 200, texture.key).setScale(4);
  });
  const counts: Record<string, number> = {};
  for (const mode of ['pixelated', 'crisp-edges']) {
    await page.locator('#game canvas').evaluate((element: HTMLCanvasElement, mode) => { element.style.imageRendering = mode; }, mode);
    const screenshot = await page.locator('#game canvas').screenshot();
    await testInfo.attach(mode, { body: screenshot, contentType: 'image/png' });
    counts[mode] = await page.evaluate(async png => {
      const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let mixed = 0, red = 0, blue = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 0 && pixels[i + 2] > 0 && pixels[i + 1] === 0) mixed++;
        if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0) red++;
        if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 255) blue++;
      }
      if (red < 100 || blue < 100) throw new Error('The sampling pattern did not render.');
      return mixed;
    }, screenshot.toString('base64'));
  }
  expect(counts).toEqual({ pixelated: 0, 'crisp-edges': 0 });
});
