import { expect, test } from '@playwright/test';

test('scene and prefab editing release the canvas from game overlays, and closing restores gameplay UI', async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  await expect(page.getByRole('button', { name: 'Toggle scene designer', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const hotspots = page.locator('#hotspots');
  await expect(hotspots).toBeHidden();
  await expect(hotspots).toHaveJSProperty('inert', true);

  // Even a game overlay shown after the editor opens cannot cover its canvas.
  await page.evaluate(() => {
    const modal = document.getElementById('modal-backdrop')!;
    modal.hidden = false;
  });
  await expect(page.locator('#modal-backdrop')).toBeHidden();
  await expect(page.locator('#modal-backdrop')).toHaveJSProperty('inert', true);
  const hit = await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas')!;
    const rect = canvas.getBoundingClientRect();
    return document.elementFromPoint(rect.left + 100, rect.top + 100) === canvas;
  });
  expect(hit).toBe(true);
  await page.evaluate(() => { document.getElementById('modal-backdrop')!.hidden = true; });

  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  await expect(hotspots).toBeHidden();
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  await expect(hotspots).toBeVisible();
  await expect(hotspots).toHaveJSProperty('inert', false);
  await hotspots.click();
  await expect(hotspots).toHaveClass(/active/);

  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await expect(hotspots).toBeVisible();
  await expect(hotspots).toHaveJSProperty('inert', false);
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await expect(hotspots).toBeHidden();
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.destroy());
  await expect(hotspots).toBeVisible();
  await expect(hotspots).toHaveJSProperty('inert', false);
});
