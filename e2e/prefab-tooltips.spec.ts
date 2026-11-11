import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('prefab fields explain native geometry and Pointlesh behavior on hover and focus', async ({ page }) => {
  await openAdventure(page, true);
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  const browser = page.getByRole('region', { name: 'Prefab browser', exact: true });
  await browser.getByRole('button', { name: 'Open Characters folder' }).click();
  await browser.getByRole('button', { name: 'Mara the innkeeper', exact: true }).click();
  const editor = page.locator('.scene-designer__panel[data-panel="prefabs"] > .scene-designer__editor');
  await editor.getByText('Directional animations', { exact: true }).click();
  await editor.getByText('Properties', { exact: true }).click();
  const fields = await editor.evaluate(root => {
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')]
      .filter(control => control.getClientRects().length > 0);
    return { count: controls.length, missing: controls.filter(control => !control.getAttribute('aria-description')).map(control => control.outerHTML.slice(0, 140)) };
  });
  expect(fields.count).toBeGreaterThan(10);
  expect(fields.missing).toEqual([]);
  const searchable = editor.locator('button.pointlesh-select-trigger').first();
  await expect(searchable).toHaveAttribute('aria-description', /\S+/);
  await searchable.hover();
  await expect(page.getByRole('tooltip')).not.toBeEmpty();
  const walkThrough = editor.getByRole('checkbox', { name: 'WalkThrough', exact: true });
  await walkThrough.hover();
  await expect(page.getByRole('tooltip')).toContainText('pathfinding routes around');
  await page.mouse.move(2, 2);
  await editor.getByRole('textbox', { name: 'Name', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText('name shown for this prefab');

  await browser.getByRole('button', { name: 'Prefabs', exact: true }).click();
  await browser.getByRole('button', { name: 'Open Inventory items folder' }).click();
  await browser.getByRole('button', { name: 'Climbing rope', exact: true }).click();
  await editor.getByRole('spinbutton', { name: 'Interaction point X', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('zero at the left edge');
});
