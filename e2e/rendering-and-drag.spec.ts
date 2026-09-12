import { expect, test } from '@playwright/test';

test('pixel-art textures preserve colors when enlarged, including textures loaded after startup', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.sys.pause();
    const actorFilter = scene.actor.texture.source[0].scaleMode;
    const backgroundSmooth = scene.background.texture.smoothPixelArt;
    for (const object of scene.children.list) object.setVisible?.(false);
    scene.cameras.main.setZoom(1).setScroll(0, 0);
    const source = document.createElement('canvas'); source.width = 2; source.height = 2;
    const context = source.getContext('2d')!;
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 1, 2);
    context.fillStyle = '#0000ff'; context.fillRect(1, 0, 1, 2);
    const texture = scene.textures.addCanvas('late-loaded-pixel-art', source);
    scene.add.image(200, 200, texture.key).setScale(40);
    const mixedPixels = async () => {
      const image = await new Promise<HTMLImageElement>(resolve => scene.renderer.snapshot(resolve));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 0 && pixels[i + 2]! > 0 && pixels[i + 1] === 0) count++;
      return count;
    };
    const nearest = await mixedPixels();
    texture.setFilter(0);
    const linear = await mixedPixels();
    return { nearest, linear, actorFilter, backgroundSmooth };
  });
  expect(result.nearest).toBe(0);
  expect(result.linear).toBeGreaterThan(1000);
  expect(result.actorFilter).toBe(1);
  expect(result.backgroundSmooth).toBe(true);
  await expect(page.locator('#game canvas')).toHaveCSS('image-rendering', 'pixelated');
});

test('Mara can be dragged from inside her prefab rectangle after selection in the scene tree', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('combobox').selectOption({ label: 'The Copper Tankard' });
  await page.getByRole('button', { name: 'Expand layer', exact: true }).click();
  await page.getByRole('button', { name: 'Mara the innkeeper Hide instance Lock instance Remove instance', exact: true }).click();
  const position = () => page.evaluate(() => {
    const object = (window as any).pointleshDemo.scene.resolved().objects.find((object: any) => object.id === 'pub.npc.innkeeper');
    return object.position;
  });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getSelection())).toMatchObject({
    type: 'prefab', instanceId: 'pub.npc.innkeeper',
  });
  const before = await position();
  const points = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const editor = scene.sceneDesigner.canvas;
    const object = editor.selectedObjectsForOverlay()[0];
    const size = editor.objectSize(object);
    const rect = scene.game.canvas.getBoundingClientRect(), camera = scene.cameras.main;
    const screen = (x: number, y: number) => ({
      x: rect.left + ((x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2) * rect.width / camera.width,
      y: rect.top + ((y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2) * rect.height / camera.height,
    });
    const y = object.y + (object.anchorY - .5) * size.height;
    return { start: screen(object.x, y), end: screen(object.x - 55, y + 25), pixel: camera.width / (rect.width * camera.zoom) };
  });
  await page.mouse.move(points.start.x, points.start.y); await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 8 }); await page.mouse.up();
  // Native mouse events quantize fractional CSS coordinates to screen pixels.
  await expect.poll(async () => Math.abs((await position()).x - (before.x - 55))).toBeLessThan(points.pixel + .001);
  await expect.poll(async () => Math.abs((await position()).y - (before.y + 25))).toBeLessThan(points.pixel + .001);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(position).toEqual(before);
});
