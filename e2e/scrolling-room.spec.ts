import { expect, test } from '@playwright/test';

test('wide forest follows walking, restores saves, and uses camera coordinates for exits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('forest');
    void scene.character.walkTo({ x: 1490, y: 465 }, scene.walkables());
  });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBeGreaterThan(1100);
  const saved = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const camera = scene.cameras.main;
    const checkpoint = scene.snapshot();
    scene.saves.save('scroll-test', checkpoint);
    const before = { position: checkpoint.characters.borin.position, scroll: camera.scrollX, zoom: camera.zoom, width: scene.background.width };
    scene.changeRoom('village');
    const village = { scrollX: camera.scrollX, scrollY: camera.scrollY, width: scene.background.width };
    scene.restore(scene.saves.load('scroll-test'));
    scene.character.stop(); scene.binding.sync(); scene.roomCamera.snap();
    return { before, village, restored: scene.character.snapshot().position, scroll: camera.scrollX };
  });
  expect(saved.before.width).toBe(1620);
  expect(saved.before.scroll).toBeGreaterThan(450);
  expect(saved.before.zoom).toBeGreaterThan(1);
  expect(saved.village).toEqual({ scrollX: 0, scrollY: 0, width: 960 });
  expect(saved.restored).toEqual(saved.before.position);
  expect(saved.scroll).toBeGreaterThan(500);
  // Snap at the right edge and inspect the actual camera's rendered world view.
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.character.place({ x: 1510, y: 465 }); scene.binding.sync(); scene.roomCamera.snap();
  });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.worldView.right)).toBeCloseTo(1620, 4);
  const point = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const gate = scene.resolved().areas.find((area: any) => area.id === 'camp-path');
    const center = gate.polygon.reduce((sum: any, point: any) => ({ x: sum.x + point.x / gate.polygon.length, y: sum.y + point.y / gate.polygon.length }), { x: 0, y: 0 });
    const screen = scene.cameras.main.matrixCombined.transformPoint(center.x, center.y);
    const canvas = scene.game.canvas, rect = canvas.getBoundingClientRect();
    return { x: rect.left + screen.x * rect.width / canvas.width, y: rect.top + screen.y * rect.height / canvas.height };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#hover-label')).toHaveText('Orc encampment');
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.story.roomId)).toBe('camp');
  expect(await page.evaluate(() => ({ x: (window as any).pointleshDemo.scene.cameras.main.scrollX, y: (window as any).pointleshDemo.scene.cameras.main.scrollY }))).toEqual({ x: 0, y: 0 });
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('forest'));
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBe(1385);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.scrollX)).toBeGreaterThan(600);
  expect(errors).toEqual([]);
});

test('native minimap pans and fits the whole forest without live edits resetting its camera', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('forest'));
  await page.locator('#designer').click();
  await page.getByRole('button', { name: 'Toggle scene minimap', exact: true }).click();
  await page.getByRole('button', { name: 'Fit the whole world', exact: true }).click();
  const fit = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    return { zoom: scene.cameras.main.zoom, scroll: scene.cameras.main.scrollX };
  });
  expect(fit.zoom).toBeCloseTo(960 / 1620, 8);
  const minimap = page.getByRole('application', { name: 'Drag to move the scene camera' });
  // Restore 100% zoom, then pan to the far side using native minimap input.
  await page.getByRole('button', { name: 'Edit zoom percentage', exact: true }).click();
  await page.getByRole('textbox', { name: 'Zoom percentage', exact: true }).fill('100');
  await page.getByRole('textbox', { name: 'Zoom percentage', exact: true }).press('Enter');
  const box = await minimap.boundingBox();
  await page.mouse.click(box!.x + box!.width * .96, box!.y + box!.height * .7);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.scrollX)).toBeGreaterThan(650);
  const edited = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const before = { x: scene.cameras.main.scrollX, y: scene.cameras.main.scrollY, zoom: scene.cameras.main.zoom };
    const designer = scene.sceneDesigner.designer;
    designer.updateAreaVertex('forest.floor::area', 'floor-0', { x: 36 });
    return before;
  });
  // Several game updates and the live geometry callback must preserve editor pan.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => page.evaluate(() => {
    const camera = (window as any).pointleshDemo.scene.cameras.main;
    return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
  })).toEqual(edited);
  await page.getByRole('button', { name: 'Toggle scene minimap', exact: true }).click();
  await page.evaluate(() => (window as any).pointleshDemo.scene.sceneDesigner.designer.close());
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.scrollX)).toBeLessThan(100);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.zoom)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
