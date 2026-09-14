import { expect, test, type Page } from '@playwright/test';

async function placePlayer(page: Page) {
  await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.character.place({ x: 350, y: 450 });
    scene.binding.sync();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function startWalk(page: Page) {
  return page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    void scene.character.walkTo({ x: 620, y: 450 });
    return scene.character.snapshot().path;
  });
}

for (const [room, entity] of [['village', 'village.npc.elder'], ['house', 'house.pickup.rope']]) {
  test(`${entity}: native WalkThrough edits control detours, persist, and support undo`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?designer=1');
    await expect(page.locator('#loading')).toBeHidden();
    await page.evaluate(({ room, entity }) => {
      const scene = (window as any).pointleshDemo.scene;
      scene.changeRoom(room);
      scene.sceneDesigner.designer.select({ type: 'object', sceneId: room, layerId: `${room}.adventure`, objectId: `${entity}::object` });
    }, { room, entity });
    for (const [label, value] of [['X', '480'], ['Y', '450']]) {
      const field = page.getByRole('spinbutton', { name: label, exact: true });
      await field.fill(value); await field.press('Tab');
    }
    const controls = page.getByRole('region', { name: 'Selected object navigation properties' });
    const toggle = controls.getByRole('checkbox', { name: 'WalkThrough', exact: true });
    await expect(toggle).not.toBeChecked();
    await placePlayer(page);
    const detour = await startWalk(page);
    expect(detour.length).toBeGreaterThanOrEqual(3);
    expect(detour.some(point => Math.abs(point.y - 450) > 1)).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toEqual({ x: 620, y: 450 });

    await toggle.check();
    await placePlayer(page);
    expect(await startWalk(page)).toEqual([{ x: 620, y: 450 }]);
    await controls.getByRole('button', { name: 'Undo' }).click();
    await expect(toggle).not.toBeChecked();
    await placePlayer(page);
    expect((await startWalk(page)).length).toBeGreaterThanOrEqual(3);
    await controls.getByRole('button', { name: 'Redo' }).click();
    await expect(toggle).toBeChecked();
    const persisted = await page.evaluate(({ room, entity }) => {
      const api = (window as any).pointleshDemo;
      const exported = JSON.parse(JSON.stringify(api.scene.sceneDesigner.designer.getManifest()));
      const value = exported.scenes[room].layers[0].prefabs.find((item: any) => item.id === entity).pointlesh.properties.walkThrough;
      api.setManifest(exported);
      return value;
    }, { room, entity });
    expect(persisted).toBe(true);
    await placePlayer(page);
    expect(await startWalk(page)).toEqual([{ x: 620, y: 450 }]);
    await toggle.uncheck();
    await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();

    // Real background input uses the same navigation world as the native edits.
    await placePlayer(page);
    const target = await page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene;
      const view = scene.cameras.main.matrix.transformPoint(620, 450);
      const rect = scene.game.canvas.getBoundingClientRect();
      return { x: rect.left + view.x * rect.width / scene.scale.gameSize.width, y: rect.top + view.y * rect.height / scene.scale.gameSize.height };
    });
    await page.mouse.click(target.x, target.y);
    const clickedPath = await page.evaluate(() => (window as any).pointleshDemo.scene.character.snapshot().path);
    expect(clickedPath.length).toBeGreaterThanOrEqual(3);
    // Browser pointer coordinates round to CSS pixels before camera unprojection.
    expect(Math.abs(clickedPath.at(-1).x - 620)).toBeLessThan(2);
    await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toEqual(clickedPath.at(-1));

    // Held arrows stop at the physical footprint instead of tunneling through it.
    await placePlayer(page);
    const leftEdge = await page.evaluate(entity => {
      const scene = (window as any).pointleshDemo.scene, sprite = scene.entitySprites.get(entity);
      return scene.navigation.obstaclesFor(scene.actor).find((polygon: any[]) => Math.abs((polygon[0].x + polygon[1].x) / 2 - sprite.x) < .001)[0].x;
    }, entity);
    await page.keyboard.press('Escape');
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBeCloseTo(leftEdge, 5);
    await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.character.state.activity)).toBe('idle');
    await page.keyboard.up('ArrowRight');
    expect(await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position.x)).toBeCloseTo(leftEdge, 5);
    expect(errors).toEqual([]);
  });
}
