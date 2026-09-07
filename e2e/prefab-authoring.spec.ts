import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Vertex = { id: string; x: number; y: number; curve?: { cx: number; cy: number } };

async function openAdventure(page: Page, instanceId: string) {
  await page.getByRole('button', { name: 'Toggle Adventure', exact: true }).click();
  await page.getByRole('combobox', { name: 'Adventure entity', exact: true }).selectOption(instanceId);
}

async function nativeArea(page: Page) {
  return page.evaluate(() => {
    const demo = (window as any).pointleshDemo;
    const instance = demo.manifest.scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.floor');
    return instance.overrides.area as { vertices: Vertex[]; closed: boolean };
  });
}

async function screenPoint(page: Page, point: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    const camera = (window as any).pointleshDemo.scene.cameras.main;
    const canvas = document.querySelector('#game canvas')!.getBoundingClientRect();
    return {
      x: canvas.left + ((x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2) * canvas.width / camera.width,
      y: canvas.top + ((y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2) * canvas.height / camera.height,
    };
  }, point);
}

async function dragPoint(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const start = await screenPoint(page, from), end = await screenPoint(page, to);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
}

test('Pointlesh area shape action opens native vertex, insertion, deletion, and curve tools', async ({ page }, testInfo) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await openAdventure(page, 'village.floor');
  await page.getByRole('region', { name: 'Pointlesh adventure properties' }).getByRole('button', { name: 'Edit shape', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getSelection())).toMatchObject({ type: 'area', areaId: 'village.floor::area' });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.getMode())).toBe('select');
  const initial = await nativeArea(page);
  const first = initial.vertices[0];
  await dragPoint(page, first, { x: first.x + 45, y: first.y - 25 });
  await expect.poll(async () => (await nativeArea(page)).vertices[0].x).toBeGreaterThan(first.x + 30);
  const moved = await nativeArea(page);
  expect(moved.vertices[0].y).toBeLessThan(first.y - 15);

  await openAdventure(page, 'village.floor');
  await page.getByRole('region', { name: 'Pointlesh adventure properties' }).getByRole('button', { name: 'Edit shape', exact: true }).click();
  const last = moved.vertices.at(-1)!;
  const middle = { x: (last.x + moved.vertices[0].x) / 2, y: (last.y + moved.vertices[0].y) / 2 };
  const addAt = await screenPoint(page, middle);
  await page.mouse.dblclick(addAt.x, addAt.y, { delay: 90 });
  await expect.poll(async () => (await nativeArea(page)).vertices.length).toBe(initial.vertices.length + 1);
  const withVertex = await nativeArea(page);
  const inserted = withVertex.vertices.find(vertex => !initial.vertices.some(original => original.id === vertex.id))!;
  const insertedScreen = await screenPoint(page, inserted);
  await page.mouse.click(insertedScreen.x, insertedScreen.y);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await nativeArea(page)).vertices.length).toBe(initial.vertices.length);

  await openAdventure(page, 'village.floor');
  await page.getByRole('region', { name: 'Pointlesh adventure properties' }).getByRole('button', { name: 'Edit shape', exact: true }).click();
  const shape = await nativeArea(page);
  const edge = { x: (shape.vertices[0].x + shape.vertices[1].x) / 2, y: (shape.vertices[0].y + shape.vertices[1].y) / 2 };
  await dragPoint(page, edge, { x: edge.x, y: edge.y + 55 });
  await expect.poll(async () => (await nativeArea(page)).vertices[0].curve?.cy ?? 0).toBeGreaterThan(edge.y + 35);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.resolved().areas.find((area: any) => area.id === 'village.floor').polygon.length)).toBeGreaterThan(initial.vertices.length);
  await page.screenshot({ path: testInfo.outputPath('native-curved-walkable-area.png'), fullPage: true });
});

test('direction animation pickers preserve sparse inheritance, flip overrides, undo, and JSON export', async ({ page }, testInfo) => {
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await openAdventure(page, 'village.borin');
  await page.getByRole('tab', { name: 'Walk', exact: true }).click();
  const left = page.getByRole('combobox', { name: 'Walk Left animation', exact: true });
  await expect(left).toHaveValue('walk-left');
  await left.selectOption('walk-back');
  const flip = page.getByRole('checkbox', { name: 'Walk Left Flip', exact: true });
  await flip.check();
  await expect(flip).toBeChecked();
  const inspector = page.getByRole('region', { name: 'Pointlesh adventure properties' });
  const downloadPromise = page.waitForEvent('download');
  await inspector.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloadPromise;
  const manifest = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const instance = manifest.scenes.village.layers.flatMap((layer: any) => layer.prefabs).find((instance: any) => instance.id === 'village.borin');
  expect(instance.pointlesh.properties.animations).toEqual({ walk: { left: { assetId: 'character.borin', key: 'walk-back', flipX: true } } });
  const resolved = await page.evaluate(() => (window as any).pointleshDemo.scene.resolved().objects.find((object: any) => object.id === 'village.borin').properties.animations);
  expect(resolved.idle.front.key).toBe('idle-front');
  expect(resolved.walk.right.key).toBe('walk-left');
  expect(resolved.walk.left.flipX).toBe(true);
  await inspector.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(flip).not.toBeChecked();
  await page.getByRole('button', { name: 'Walk Left Use prefab', exact: true }).click();
  await expect(left).toHaveValue('walk-left');
  await expect(page.getByRole('button', { name: 'Walk Left Use prefab', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Character directions', exact: true }).selectOption('8');
  await expect(page.getByRole('combobox', { name: 'Walk Front left animation', exact: true })).toBeVisible();
  const facing = page.getByRole('combobox', { name: 'Facing', exact: true });
  await expect(facing.locator('option')).toHaveCount(8);
  await facing.selectOption({ label: 'Back' });
  await expect(facing).toHaveValue('up');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.resolved().objects.find((object: any) => object.id === 'village.borin').properties.facing)).toBe('up');
  await expect.poll(() => page.evaluate(() => ({
    facing: (window as any).pointleshDemo.scene.character.state.facing,
    animation: (window as any).pointleshDemo.scene.actor.anims.currentAnim?.key,
  }))).toMatchObject({ facing: 'up', animation: expect.stringContaining('idle-back') });
  await expect(page.getByRole('spinbutton', { name: 'Frame duration (ms)', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('directional-animation-pickers.png'), fullPage: true });
});
