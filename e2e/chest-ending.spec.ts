import { expect, test } from '@playwright/test';
import { isWalkable, resolvePointleshScene, walkablePolygons } from '@pointlesh/core';
import { openAdventure } from './start-helpers';

test('runes glow, the lid opens, and a second click collects one pickaxe across save/load', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('mine'); scene.story.flags.knowsPassword = true;
    scene.game.loop.sleep(); scene.applyInteraction('tool-chest');
  });
  await page.locator('#dialog-next').click();
  await page.getByRole('button', { name: 'Stone remembers.', exact: true }).click();
  await expect(page.locator('#speech')).toContainText('runes glow');
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const view = () => {
      const sprite = scene.entitySprites.get('tool-chest');
      return { frame: sprite.frame.name, key: sprite.texture.key, x: sprite.x, y: sprite.y,
        width: sprite.displayWidth, height: sprite.displayHeight, items: [...scene.story.inventory],
        open: !!scene.story.flags.chestOpen, pending: scene.story.chestOpening?.elapsedMs };
    };
    const closed = view();
    for (let i = 0; i < 8; i++) scene.update(0, 100);
    const glowing = view(), saved = scene.snapshot();
    scene.restore(saved); const restored = view();
    for (let i = 0; i < 14; i++) scene.update(0, 100);
    const open = view();
    return { closed, glowing, restored, open };
  });
  expect(result.closed).toMatchObject({ frame: 0, key: 'tool-chest.open', open: false, pending: 0 });
  expect(result.glowing.frame).toBeGreaterThan(0); expect(result.glowing.items).not.toContain('pickaxe');
  expect(result.restored).toEqual(result.glowing);
  expect(result.open).toMatchObject({ frame: 7, key: 'tool-chest.open', open: true });
  expect(result.open.items).not.toContain('pickaxe');
  expect(result.open.x).toBe(result.closed.x); expect(result.open.y).toBe(result.closed.y);
  expect(result.open.width).toBe(result.closed.width); expect(result.open.height).toBe(result.closed.height);
  await page.evaluate(() => { const s = (window as any).pointleshDemo.scene; s.scene.pause(); s.game.loop.wake(); });
  await page.screenshot({ path: testInfo.outputPath('open-chest-pickaxe.png') });
  await page.locator('#dialog-next').click();
  await expect(page.locator('#dialog')).toBeHidden();
  // Click the actual object, not its old hotspot or a story shortcut.
  const click = await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene, sprite = s.entitySprites.get('tool-chest');
    s.scene.resume(); s.game.loop.wake();
    const c = s.game.canvas.getBoundingClientRect(), camera = s.cameras.main;
    const p = camera.matrix.transformPoint(sprite.x, sprite.y - 20);
    return { x: c.left + p.x * c.width / camera.width, y: c.top + p.y * c.height / camera.height };
  });
  await page.mouse.click(click.x, click.y);
  await expect(page.locator('#speech')).toHaveText('Orrin’s finest pickaxe. For the king.');
  const collected = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const saved = scene.snapshot(); scene.restore(saved);
    const sprite = scene.entitySprites.get('tool-chest');
    return { items: scene.story.inventory, key: sprite.texture.key, frame: sprite.frame.name };
  });
  expect(collected.items.filter((item: string) => item === 'pickaxe')).toHaveLength(1);
  expect(collected.key).toBe('tool-chest.empty'); expect(collected.frame).toBe(8);
  await page.locator('#dialog-next').click();
  await page.getByRole('button', { name: 'Interact with Runed tool chest', exact: true }).click();
  await expect(page.locator('#speech')).toContainText('empty');
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('empty-chest.png') });
});

test('both ending actors stay on authored ground for every shot and restore without moving', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const result = await page.evaluate(async () => {
    const api = (window as any).pointleshDemo, scene = api.scene;
    const { CINEMATIC_DURATIONS } = await import('/src/cinematics.ts' as string);
    scene.game.loop.sleep(); scene.story.flags.guardBound = scene.story.flags.guardAsleep = true;
    scene.story.endingStep = 0; scene.renderCutscene();
    const samples = [];
    for (let step = 0; step < 4; step++) for (let ms = 0; ms <= CINEMATIC_DURATIONS.ending[step]; ms += 50) {
      scene.cinematic.render(step, ms);
      for (const actor of scene.cinematic.snapshot().cast.filter((a: any) => a.visible && ['borin', 'king'].includes(a.id))) samples.push({ step, ms, actor });
    }
    scene.story.endingStep = 2;
    scene.endingRunner.restore({ cutsceneId: 'forest.ending', version: 1, stepIndex: 2, elapsedMs: 2600 });
    scene.renderCutscene(); const before = scene.cinematic.snapshot();
    scene.restore(scene.snapshot()); const after = scene.cinematic.snapshot();
    scene.scene.pause(); scene.game.loop.wake();
    return { samples, manifest: api.manifest, before, after };
  });
  const camp = resolvePointleshScene(result.manifest, 'camp');
  const forest = resolvePointleshScene(result.manifest, 'forest'), village = resolvePointleshScene(result.manifest, 'village');
  const floors = [walkablePolygons({ ...camp, areas: camp.areas.map(area => area.id === 'camp.cage-approach' ? { ...area, enabled: true } : area) }),
    walkablePolygons({ ...forest, areas: forest.areas.map(area => ['forest.transition.to-camp', 'forest.transition.to-village'].includes(area.id) ? { ...area, enabled: true } : area) }),
    walkablePolygons({ ...village, areas: village.areas.map(area => area.id === 'village.transition.to-forest' ? { ...area, enabled: true } : area) })];
  for (const { step, ms, actor } of result.samples) expect(isWalkable(actor, floors[step < 2 ? 0 : step - 1]), `ending ${step}/${ms}ms: ${actor.id}`).toBe(true);
  const { tsImport } = await import('tsx/esm/api');
  const { forestPortal } = await tsImport('../demos/forest/src/transition-content.ts', import.meta.url);
  const exit = forestPortal(result.manifest, 'forest', 'village'), entry = forestPortal(result.manifest, 'village', 'forest');
  for (const id of ['borin', 'king']) {
    const departure = result.samples.filter(sample => sample.step === 2 && sample.actor.id === id).at(-1)!.actor;
    expect(departure.x).toBeCloseTo(exit.path.at(-1)!.x); expect(departure.y).toBeCloseTo(exit.path.at(-1)!.y);
    const arrival = result.samples.find(sample => sample.step === 3 && sample.actor.id === id)!.actor;
    expect(arrival.x).toBeCloseTo(entry.path.at(-1)!.x); expect(arrival.y).toBeCloseTo(entry.path.at(-1)!.y);
  }
  expect(result.after.cast.filter((actor: any) => actor.visible)).toEqual(result.before.cast.filter((actor: any) => actor.visible));
  expect(result.after.elapsedMs).toBe(result.before.elapsedMs); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('forest-homeward.png') });
  await page.evaluate(() => { const s = (window as any).pointleshDemo.scene; s.story.endingStep = 3; s.endingRunner.restore({ cutsceneId: 'forest.ending', version: 1, stepIndex: 3, elapsedMs: 2000 }); s.renderCutscene(); });
  await page.screenshot({ path: testInfo.outputPath('village-homecoming.png') });
  await page.evaluate(() => (window as any).pointleshDemo.scene.cinematic.render(2, 4100));
  await page.screenshot({ path: testInfo.outputPath('forest-exit.png') });
});
