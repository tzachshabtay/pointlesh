import { expect, test } from '@playwright/test';
import { selectInstance } from './designer-helpers';

test.setTimeout(60000);

const context = (page: any) => page.getByRole('region', { name: 'Pointlesh properties', exact: true });
const position = (page: any, id: string) => page.evaluate((id: string) => (window as any).pointleshDemo.scene.resolved().points.find((point: any) => point.id === id).position, id);

test('named points drag in world coordinates, rename without breaking references, and undo as one edit', async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  const id = 'village.entry.from-pub';
  await selectInstance(page, id);
  const before = await position(page, id);
  const handle = page.locator(`.pointlesh-point-handle[data-point-id="${id}"]`);
  const box = await handle.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 45, box!.y + box!.height / 2 + 25, { steps: 5 }); await page.mouse.up();
  const moved = await position(page, id);
  expect(moved.x).toBeGreaterThan(before.x + 20); expect(moved.y).toBeGreaterThan(before.y + 10);
  await context(page).getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await position(page, id)).toEqual(before);
  await context(page).getByRole('button', { name: 'Redo', exact: true }).click(); expect(await position(page, id)).toEqual(moved);
  const name = context(page).getByRole('textbox', { name: 'Point name', exact: true });
  await name.fill('Pub arrival'); await name.press('Tab');
  await expect(handle).toHaveAttribute('aria-label', 'Point: Pub arrival');
  await selectInstance(page, 'pub-door');
  const walkPoint = context(page).getByRole('combobox', { name: 'Walk point', exact: true });
  await expect(walkPoint).toHaveValue(id);
  await expect(walkPoint.locator(`option[value="${id}"]`)).toHaveText('Pub arrival');
  await walkPoint.selectOption(''); await expect(walkPoint).toHaveValue('');
  await context(page).getByRole('button', { name: 'Undo', exact: true }).click(); await expect(walkPoint).toHaveValue(id);
  await selectInstance(page, id);
  const exported = await page.evaluate(() => JSON.parse((window as any).pointleshDemo.scene.sceneDesigner.inspector.exportManifest()));
  expect(exported.scenes.village.layers[0].prefabs.find((item: any) => item.id === id).name).toBe('Pub arrival');
});

test('Move and Walk act on the selected live character and preserve authored placements', async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  const id = 'village.entry.from-pub'; await selectInstance(page, id);
  const point = await position(page, id);
  const authored = await page.evaluate(() => (window as any).pointleshDemo.manifest);
  const character = context(page).getByRole('combobox', { name: 'Character', exact: true });
  await character.selectOption('village.borin');
  await context(page).getByRole('button', { name: 'Move character here', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toEqual(point);
  // Put Borin safely away so he doesn't occupy Rowan's destination.
  await page.evaluate(() => (window as any).pointleshDemo.scene.character.place({ x: 471, y: 470 }));
  await character.selectOption('village.npc.elder');
  const before = await page.evaluate(() => (window as any).pointleshDemo.scene.npcActors.get('village.npc.elder').controller.state.position);
  await context(page).getByRole('button', { name: 'Walk character here', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.npcActors.get('village.npc.elder').controller.isWalking)).toBe(true);
  expect(before).not.toEqual(point);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.npcActors.get('village.npc.elder').controller.state.position), { timeout: 20000 }).toEqual(point);
  expect(await page.evaluate(() => (window as any).pointleshDemo.manifest)).toEqual(authored);
});

test('scene entry uses the point for the source room, including live edits and the scrolled forest', async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  for (const from of ['village', 'mine', 'camp']) {
    const result = await page.evaluate(from => {
      const scene = (window as any).pointleshDemo.scene;
      scene.changeRoom(from); scene.changeRoom('forest');
      return { actual: scene.character.state.position, expected: scene.resolved().points.find((point: any) => point.id === `forest.entry.from-${from}`).position };
    }, from);
    expect(result.actual).toEqual(result.expected);
  }
  await selectInstance(page, 'forest.entry.from-camp');
  await context(page).getByRole('spinbutton', { name: 'X', exact: true }).fill('1300');
  await context(page).getByRole('spinbutton', { name: 'X', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.changeRoom('camp'); scene.changeRoom('forest'); });
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBe(1300);
});

test('object interaction waits for the assigned point and unreachable points prevent the effect', async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('house'));
  await selectInstance(page, 'house.pickup.coin');
  const pointId = 'house.walk.house.pickup.coin';
  await expect(context(page).getByRole('combobox', { name: 'Walk point', exact: true })).toHaveValue(pointId);
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  const goal = await position(page, pointId);
  await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.character.place({ x: 450, y: 470 }); void scene.act('coin'); });
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.story.inventory)).not.toContain('coin');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.story.inventory)).toContain('coin');
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toEqual(goal);
  await page.evaluate(() => (window as any).pointleshDemo.scene.dismissSpeech());
  await selectInstance(page, 'house.walk.house.pickup.rope');
  await context(page).getByRole('spinbutton', { name: 'Y', exact: true }).fill('-200');
  await context(page).getByRole('spinbutton', { name: 'Y', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.evaluate(() => (window as any).pointleshDemo.scene.act('rope'));
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.story.inventory)).not.toContain('rope');
});

test('create and place a Point through the prefab browser', async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle prefab designer', exact: true }).click();
  const browser = page.getByRole('region', { name: 'Prefab browser', exact: true });
  await browser.getByRole('button', { name: 'Open Points folder' }).click();
  await browser.getByRole('button', { name: 'New prefab', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New prefab', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Prefab type' })).toHaveValue('pointlesh.point');
  await dialog.getByRole('textbox', { name: 'Prefab name' }).fill('Lookout');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(context(page).getByRole('spinbutton', { name: 'X', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.getByRole('button', { name: 'Add prefab', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Choose prefab', exact: true });
  await picker.getByRole('button', { name: 'Open Points folder' }).click();
  await picker.getByRole('button', { name: 'Lookout', exact: true }).click();
  await page.locator('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.pointlesh-point-handle[aria-label="Point: Lookout"]')).toBeVisible();
});

test('point dragging follows a panned and zoomed camera and respects instance locks', async ({ page }) => {
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('forest'));
  const id = 'forest.entry.from-camp'; await selectInstance(page, id);
  await page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.setScroll(900, 0).setZoom(.8));
  const handle = page.locator(`.pointlesh-point-handle[data-point-id="${id}"]`);
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  const destination = { x: box.x + box.width / 2 - 45, y: box.y + box.height / 2 + 15 };
  const expected = await page.evaluate(({ x, y }) => {
    const scene = (window as any).pointleshDemo.scene, rect = scene.game.canvas.getBoundingClientRect();
    const point = scene.cameras.main.getWorldPoint((x - rect.left) * scene.scale.gameSize.width / rect.width, (y - rect.top) * scene.scale.gameSize.height / rect.height);
    return { x: point.x, y: point.y };
  }, destination);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 }); await page.mouse.up();
  const moved = await position(page, id);
  expect(moved.x).toBeCloseTo(expected.x, 0); expect(moved.y).toBeCloseTo(expected.y, 0);
  await page.evaluate(id => {
    const designer = (window as any).pointleshDemo.scene.sceneDesigner.designer, manifest = designer.getManifest();
    manifest.scenes.forest.layers[0].prefabs.find((point: any) => point.id === id).locked = true;
    designer.setManifest(manifest);
  }, id);
  await expect(handle).toBeDisabled();
});
