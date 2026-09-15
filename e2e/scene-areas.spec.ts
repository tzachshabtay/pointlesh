import { expect, test } from '@playwright/test';
import { expandProperties, selectInstance } from './designer-helpers';

test('areas and hotspots belong to scenes, retain edits and never appear in the prefab browser', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  const initial = await page.evaluate(() => (window as any).pointleshDemo.manifest);
  expect(Object.values(initial.prefabs).every((prefab: any) => ['character', 'object'].includes(prefab.pointlesh.kind))).toBe(true);
  await selectInstance(page, 'village.foreground');
  const context = page.getByRole('region', { name: 'Pointlesh properties', exact: true });
  await expect(context.getByRole('button', { name: 'Edit prefab', exact: true })).toHaveCount(0);
  await expect(context.getByText('Inherited from prefab', { exact: true })).toHaveCount(0);
  const baseline = context.getByRole('spinbutton', { name: 'Baseline', exact: true });
  const before = await baseline.inputValue();
  await baseline.fill('400'); await baseline.press('Tab');
  const manifest = await page.evaluate(() => (window as any).pointleshDemo.manifest);
  expect(manifest.scenes.village.layers[0].areas.find((area: any) => area.id === 'village.foreground::area').pointlesh.properties.baseline).toBe(400);
  expect(manifest.scenes.house).toEqual(initial.scenes.house);
  expect(manifest.prefabs).toEqual(initial.prefabs);
  await context.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(baseline).toHaveValue(before);
  await context.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(baseline).toHaveValue('400');
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  const browser = page.getByRole('region', { name: 'Prefab browser', exact: true });
  await expect(browser.getByRole('button', { name: 'Open Areas folder' })).toHaveCount(0);
  await expect(browser.getByRole('button', { name: 'Open Hotspots folder' })).toHaveCount(0);
  await browser.getByRole('button', { name: 'New prefab', exact: true }).click();
  expect(await page.getByRole('combobox', { name: 'Prefab type' }).locator('option').allTextContents()).toEqual(['Object', 'Character']);
  await page.getByRole('dialog', { name: 'New prefab' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(errors).toEqual([]);
});

for (const kind of ['area', 'hotspot'] as const) test(`draw a new scene ${kind}, extend it, delete it and undo without creating a prefab`, async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Expand layer', exact: true }).click();
  const prefabs = await page.evaluate(() => (window as any).pointleshDemo.manifest.prefabs);
  await page.getByRole('button', { name: `Add ${kind}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `New ${kind}` });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Test region');
  await dialog.getByRole('button', { name: 'Draw shape', exact: true }).click();
  const areaId = await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getSelection().areaId);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getMode())).toBe('area-draw');
  // Use the native geometry commands that canvas drawing dispatches.
  await page.evaluate(areaId => {
    const designer = (window as any).pointleshDemo.scene.sceneDesigner.designer;
    for (const [x, y] of [[100, 400], [250, 400], [180, 480]]) designer.addAreaVertex(areaId, x, y);
    designer.closeArea(areaId); designer.setMode('select');
  }, areaId);
  const context = page.getByRole('region', { name: 'Pointlesh properties', exact: true });
  if (kind === 'area') await context.getByRole('checkbox', { name: 'Walkable', exact: true }).check();
  await expandProperties(page, 'Custom properties & behaviors');
  await context.getByRole('textbox', { name: 'Behavior IDs', exact: true }).fill('test.interact');
  await context.getByRole('textbox', { name: 'Behavior IDs', exact: true }).press('Tab');
  await context.getByText('Add custom property', { exact: true }).click();
  await context.getByRole('textbox', { name: 'Custom property name' }).fill('quest');
  await context.getByRole('textbox', { name: 'Custom property JSON value' }).fill('"rescue"');
  await context.getByRole('button', { name: 'Add property', exact: true }).click();
  const current = await page.evaluate(areaId => {
    const api = (window as any).pointleshDemo;
    return { manifest: JSON.parse(api.scene.sceneDesigner.inspector.exportManifest()), region: api.scene.resolved().areas.find((area: any) => area.id === areaId) };
  }, areaId);
  expect(current.manifest.prefabs).toEqual(prefabs);
  expect(current.region).toMatchObject({ kind, behaviors: ['test.interact'], properties: { quest: 'rescue' }, closed: true });
  const row = page.getByRole('button', { name: 'Select Test region', exact: true });
  await row.getByRole('button', { name: 'Remove area', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.undo());
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => (window as any).pointleshDemo.manifest.prefabs)).toEqual(prefabs);
});
