import { test, expect } from '@playwright/test';

test('Scenes bottom edge expands a scrolled panel and retains its size after switching tabs', async ({ page }) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  const panel = page.locator('.scene-designer__panel[data-panel="scenes"]');
  await panel.getByRole('button', { name: 'Expand layer', exact: true }).click();
  const id = await panel.getAttribute('id');
  const grip = page.locator(`[data-resize-panel="${id}"] [data-edge="s"]`);
  const dragBottom = async (dy: number) => {
    const rect = (await grip.boundingBox())!;
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y + dy, { steps: 6 }); await page.mouse.up();
  };
  // Resize down from the initial full-height view, then reproduce the user's
  // short, scrolled inspector and drag its actual bottom border down again.
  const initial = (await panel.boundingBox())!;
  await dragBottom(340 - initial.height);
  const small = (await panel.boundingBox())!;
  await page.mouse.move(small.x + 100, small.y + 150);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => panel.evaluate(p => p.scrollTop)).toBeGreaterThan(0);
  expect(await panel.evaluate(p => p.scrollWidth)).toBe(await panel.evaluate(p => p.clientWidth));
  await dragBottom(180);
  const expanded = (await panel.boundingBox())!;
  expect(expanded.height).toBeCloseTo(small.height + 180, 0);
  expect(expanded.y).toBeCloseTo(small.y, 0);
  await page.mouse.move(100, 100);
  expect(await panel.boundingBox()).toEqual(expanded);
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  await expect(grip).toBeHidden();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  expect(await panel.boundingBox()).toEqual(expanded);
  // Keeping editor controls usable proves the border frame doesn't cover the panel.
  await panel.getByRole('button', { name: 'Collapse layer', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Expand layer', exact: true })).toBeVisible();
});
