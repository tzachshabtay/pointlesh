import { expect, test } from '@playwright/test';

test('asset thumbnails load from public game files without contacting a local authoring service', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect.poll(() => page.locator('img').evaluateAll(images => images.filter(image => image.src.includes('atlas-')).every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(requests.filter(url => /127\.0\.0\.1:428[789]\//.test(url))).toEqual([]);
  expect(requests.some(url => url.includes('/art/atlas-village-pub.png'))).toBe(true);
});

test('adventure inspector commits and undo reach the live runtime and reject invalid nested extension data', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(() => {
    const demo = (window as any).pointleshDemo;
    const scene = demo.scene;
    const inspector = scene.sceneDesigner.inspector;
    const initialSpeed = scene.character.config.speed;
    const initial = inspector.exportManifest();
    inspector.setProperties('village.borin', { speed: 171, courage: 22 });
    const speedAfterEdit = scene.character.config.speed;
    const editedManifest = demo.manifest;
    const instance = editedManifest.scenes.village.layers.flatMap((layer: any) => layer.prefabs ?? []).find((value: any) => value.id === 'village.borin');
    const courageAfterEdit = instance.pointlesh.properties.courage;
    const beforeInvalid = inspector.exportManifest();
    let rejected = false;
    try { inspector.setProperties('village.borin', { custom: { nested: { value: Infinity } } }); }
    catch { rejected = true; }
    const preserved = inspector.exportManifest() === beforeInvalid;
    inspector.undo();
    return { initialSpeed, speedAfterEdit, courageAfterEdit, rejected, preserved, speedAfterUndo: scene.character.config.speed, exactUndo: inspector.exportManifest() === initial };
  });
  expect(result.speedAfterEdit).toBe(171);
  expect(result.courageAfterEdit).toBe(22);
  expect(result.rejected).toBe(true);
  expect(result.preserved).toBe(true);
  expect(result.speedAfterUndo).toBe(result.initialSpeed);
  expect(result.exactUndo).toBe(true);
});
