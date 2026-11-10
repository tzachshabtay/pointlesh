import { openAdventure } from './start-helpers';
import { expect, test, type Page } from '@playwright/test';

const toggle = (page: Page) => page.getByRole('button', { name: 'Toggle scene designer', exact: true });
const row = (page: Page, name: string) => page.locator('.scene-designer__item').filter({ has: page.locator('.scene-designer__item-title').getByText(name, { exact: true }) });

async function state(page: Page) {
  return page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    return {
      walkables: scene.walkables(),
      obstacles: scene.navigation.obstaclesFor(scene.actor).length,
      objects: ['camp.npc.guard', 'camp.npc.king'].map(id => {
        const sprite = scene.entitySprites.get(id);
        return { id, enabled: scene.resolved().objects.find((object: any) => object.id === id).enabled,
          visible: sprite.visible, active: sprite.active, alpha: sprite.alpha,
          rendered: (sprite.cameraFilter & scene.cameras.main.id) === 0 };
      }),
    };
  });
}

async function start(page: Page) {
  await openAdventure(page, true);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
  await page.getByRole('combobox').selectOption('camp');
  // Local promoted scene data may already have these editor-only controls off.
  await page.evaluate(() => {
    const designer = (window as any).pointleshDemo.scene.sceneDesigner.designer;
    const manifest = designer.getManifest();
    for (const layer of manifest.scenes.camp.layers) {
      layer.visible = true; layer.locked = false;
      for (const item of [...(layer.prefabs ?? []), ...layer.areas]) { item.visible = true; item.locked = false; }
    }
    designer.setManifest(manifest);
  });
}

test('eye and lock controls only affect editing, including live blockers and hidden walkable areas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const before = await state(page);
  expect(before.walkables.length).toBeGreaterThan(0);
  expect(before.obstacles).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.character.place({ x: 180, y: 465 });
    void scene.character.walkTo({ x: 300, y: 465 });
  });
  for (const name of ['Grub the guard', 'King Aldric']) {
    await row(page, name).getByRole('button', { name: `Hide ${name}`, exact: true }).click();
    await row(page, name).getByRole('button', { name: `Lock ${name}`, exact: true }).click();
  }
  await row(page, 'Walkable ground & perspective').getByRole('button', { name: 'Hide Walkable ground & perspective', exact: true }).click();
  await row(page, 'Walkable ground & perspective').getByRole('button', { name: 'Lock Walkable ground & perspective', exact: true }).click();
  await expect.poll(() => state(page)).toEqual({ ...before, objects: before.objects.map(object => ({ ...object, rendered: false })) });
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBeCloseTo(300, 0);
  // The hidden guard continues walking/animating while the editor is open.
  const guardProgress = () => page.evaluate(() => {
    const patrol = (window as any).pointleshDemo.scene.guardPatrol;
    return { phase: patrol.phase, elapsed: patrol.elapsedMs };
  });
  const progress = await guardProgress();
  await expect.poll(guardProgress).not.toEqual(progress);

  await toggle(page).click();
  await expect.poll(() => state(page)).toEqual(before);
  // Complete the stealth restriction before testing ordinary player input.
  // The earlier checks still exercise the awake guard's live patrol.
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.story.flags.guardAsleep = true;
    scene.guardPatrol.start(true);
    scene.campStealth.cancel();
  });
  const unrestricted = await state(page);
  expect(unrestricted.objects).toEqual(before.objects);
  expect(unrestricted.obstacles).toBe(before.obstacles);
  // Click-to-walk still works even though the designer remembers a hidden floor.
  const target = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.character.place({ x: 180, y: 465 });
    const c = scene.cameras.main, rect = scene.game.canvas.getBoundingClientRect();
    return { x: rect.left + ((300 - c.scrollX - c.width / 2) * c.zoom + c.width / 2) * rect.width / c.width,
      y: rect.top + ((465 - c.scrollY - c.height / 2) * c.zoom + c.height / 2) * rect.height / c.height };
  });
  await page.mouse.click(target.x, target.y);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBeGreaterThan(260);

  await toggle(page).click();
  await expect(row(page, 'Grub the guard').getByRole('button', { name: 'Show Grub the guard', exact: true })).toBeVisible();
  await expect(row(page, 'Walkable ground & perspective').getByRole('button', { name: 'Unlock Walkable ground & perspective', exact: true })).toBeVisible();
  await expect.poll(() => state(page)).toEqual({ ...unrestricted, objects: unrestricted.objects.map(object => ({ ...object, rendered: false })) });
  await page.getByRole('button', { name: 'Hide characters', exact: true }).click();
  await page.getByRole('button', { name: 'Lock characters', exact: true }).click();
  await toggle(page).click();
  await expect.poll(() => state(page)).toEqual(unrestricted);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.actor.visible)).toBe(true);
  const x = await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x);
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBeGreaterThan(x + 20);
  await page.keyboard.up('ArrowRight');
  expect(errors).toEqual([]);
});

test('loading saved editor-hidden items leaves gameplay enabled, and game-hidden pickups stay hidden', async ({ page }) => {
  await start(page);
  await toggle(page).click();
  const before = await state(page);
  await page.evaluate(() => {
    const api = (window as any).pointleshDemo, manifest = api.manifest;
    for (const layer of manifest.scenes.camp.layers) {
      layer.visible = false; layer.locked = true;
      for (const item of [...(layer.prefabs ?? []), ...layer.areas]) { item.visible = false; item.locked = true; }
    }
    api.setManifest(manifest);
    api.scene.changeRoom('forest'); api.scene.changeRoom('camp');
  });
  await expect.poll(() => state(page)).toEqual(before);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.story.inventory.push('rope'); scene.story.flags.tookRope = true;
    scene.changeRoom('house');
  });
  const ropeVisible = () => page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('house.pickup.rope').visible);
  await expect.poll(ropeVisible).toBe(false);
  await toggle(page).click(); await toggle(page).click();
  await expect.poll(ropeVisible).toBe(false);
});
