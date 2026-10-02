import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('pub geometry stays intact across Journal close and canvas resizing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1150, height: 1000 });
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('pub'); scene.sys.pause();
    // End the render with a textured quad after the foreground's triangle mask.
    scene.add.image(0, 0, scene.background.texture.key).setDisplaySize(1, 1).setDepth(10000);
    const renderer = scene.renderer, gl = renderer.gl;
    const original = gl.drawElements;
    (window as any).wrongGeometryBuffers = 0;
    gl.drawElements = function (...args: any[]) {
      const vao = renderer.glWrapper.state.vao;
      if (vao?.indexBuffer && gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) !== vao.indexBuffer.webGLBuffer) {
        (window as any).wrongGeometryBuffers++;
      }
      return original.apply(this, args);
    };
  });
  const pixels = () => page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    const image = await new Promise<HTMLImageElement>(resolve => scene.renderer.snapshot(resolve));
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const digest = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, canvas.width, canvas.height).data);
    return Array.from(new Uint8Array(digest)).join(',');
  });
  const before = await pixels();
  for (let index = 0; index < 3; index++) {
    await page.locator('#journal').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width: 1149, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath(`pub-resized-${index}.png`) });
    await page.setViewportSize({ width: 1150, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath(`pub-journal-${index}.png`) });
    expect(await pixels()).toBe(before);
  }
  expect(await page.evaluate(() => (window as any).wrongGeometryBuffers)).toBe(0);
});
