import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/authoring/*.json', route => route.fulfill({ status: 404, body: '' }));
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
});

test('the mine chest renders its own clickable artwork and opens the existing puzzle', async ({ page }, testInfo) => {
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('mine'));
  const point = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene, sprite = scene.entitySprites.get('tool-chest');
    const room = scene.resolved();
    if (room.areas.some((area: any) => area.id === 'tool-chest')) throw new Error('Duplicate chest hotspot');
    const canvas = scene.game.canvas.getBoundingClientRect(), camera = scene.cameras.main;
    const p = camera.matrix.transformPoint(sprite.x, sprite.y - 30);
    return { x: canvas.left + p.x * canvas.width / camera.width, y: canvas.top + p.y * canvas.height / camera.height,
      texture: sprite.texture.key, visible: sprite.visible };
  });
  expect(point.texture).toBe('tool-chest'); expect(point.visible).toBe(true);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#hover-label')).toHaveText('Runed tool chest');
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#speech')).toContainText('WHAT DOES THE MOUNTAIN REMEMBER');
  await page.screenshot({ path: testInfo.outputPath('runed-chest.png') });
});

test('the ending uses authored size and live room perspective for every character', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = (window as any).pointleshDemo, scene = api.scene, manifest = api.manifest;
    scene.game.loop.sleep();
    const floor = manifest.scenes.village.layers[0].areas.find((area: any) => area.pointlesh?.entityId === 'village.floor');
    floor.pointlesh.properties.minScale = floor.pointlesh.properties.maxScale = 1.8;
    const borin = manifest.scenes.village.layers[0].prefabs.find((instance: any) => instance.id === 'village.borin');
    borin.overrides.object.scaleX = 1.4; borin.overrides.object.scaleY = 1.2;
    api.setManifest(manifest);
    scene.story.endingStep = 3;
    scene.endingRunner.restore({ cutsceneId: 'forest.ending', version: 1, stepIndex: 3, elapsedMs: 4900 });
    scene.renderCutscene();
    const cast = () => scene.children.getByName('pointlesh-cinematic').list[0].list.filter((object: any) => object.name.startsWith('cinematic-') && object.visible);
    const sizes = () => cast().map((sprite: any) => ({ name: sprite.name, width: sprite.displayWidth, height: sprite.displayHeight }));
    const first = sizes();
    const next = api.manifest;
    next.scenes.village.layers[0].areas.find((area: any) => area.pointlesh?.entityId === 'village.floor').pointlesh.properties.scaleEnabled = false;
    api.setManifest(next); scene.renderCutscene();
    const second = sizes();
    scene.advanceCutscene(true); scene.game.loop.wake();
    return { first, second };
  });
  const borin = result.first.find((actor: any) => actor.name === 'cinematic-borin');
  expect(borin.width).toBeCloseTo(24 * 1.4 * 1.8); expect(borin.height).toBeCloseTo(32 * 1.2 * 1.8);
  expect(result.first).toHaveLength(5);
  for (const actor of result.first) {
    const unscaled = result.second.find((other: any) => other.name === actor.name);
    expect(actor.width / unscaled.width).toBeCloseTo(1.8);
    expect(actor.height / unscaled.height).toBeCloseTo(1.8);
  }
});

test('poisoned guard collapses, restores mid-fall, and stays on the lying frame in gameplay and the ending', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('camp'); scene.game.loop.sleep(); scene.story.flags.stewSpiked = true;
    const patrol = () => scene.guardPatrol;
    const sprite = () => scene.npcActors.get('camp.npc.guard').sprite;
    const view = () => ({ phase: patrol().phase, frame: sprite().frame.name, key: sprite().texture.key, angle: sprite().angle,
      asleep: !!scene.story.flags.guardAsleep, character: patrol().snapshot() });
    for (let i = 0; i < 4000 && patrol().phase !== 'collapse'; i++) patrol().update(25);
    const start = view(); patrol().update(500); const falling = view();
    const saved = scene.snapshot(); scene.restore(saved); const restored = view();
    patrol().update(10000); const sleeping = view();
    const sleepingSave = scene.snapshot(); scene.restore(sleepingSave); patrol().update(10000); const stillSleeping = view();
    scene.story.endingStep = 0; scene.renderCutscene();
    const cinematicGuard = scene.children.getByName('pointlesh-cinematic').list[0].list.find((object: any) => object.name === 'cinematic-guard-front');
    const cinematic = { frame: cinematicGuard.frame.name, key: cinematicGuard.texture.key, angle: cinematicGuard.angle };
    return { start, falling, restored, sleeping, stillSleeping, cinematic };
  });
  expect(result.start).toMatchObject({ phase: 'collapse', key: 'guard.collapse', asleep: false, angle: 0 });
  expect(result.falling.phase).toBe('collapse'); expect(result.falling.frame).not.toBe(result.start.frame);
  expect(result.restored).toEqual(result.falling);
  expect(result.sleeping).toMatchObject({ phase: 'asleep', frame: 7, key: 'guard.collapse', asleep: true, angle: 0 });
  expect(result.stillSleeping).toEqual(result.sleeping);
  expect(result.cinematic).toEqual({ frame: 7, key: 'guard.collapse', angle: 0 });
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.scene.pause(); scene.game.loop.wake();
  });
  await page.screenshot({ path: testInfo.outputPath('sleeping-guard-ending.png') });
});

test('rope binds the sleeping guard, survives save/load, and Aldric walks through the cage door', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep(); scene.story.flags.guardAsleep = true; scene.story.inventory = ['rope', 'pickaxe'];
    scene.changeRoom('camp');
    const rope = () => scene.children.getByName('guard-rope');
    const unbound = rope().visible;
    scene.applyInteraction('guard', 'rope'); scene.dismissSpeech();
    const save = scene.snapshot(); scene.restore(save);
    const bound = { visible: rope().visible, commands: rope().commandBuffer.length, flag: scene.story.flags.guardBound, inventory: [...scene.story.inventory] };
    scene.changeRoom('forest'); const outsideCamp = rope().visible; scene.changeRoom('camp');
    const returned = rope().visible;
    scene.applyInteraction('cage', 'pickaxe');
    const cast = scene.children.getByName('pointlesh-cinematic').list[0];
    const king = cast.list.find((object: any) => object.name === 'cinematic-king');
    const door = cast.list.find((object: any) => object.name === 'cage-door-cinematic');
    const insideDoor = king.depth < door.depth;
    scene.cinematic.render(1, 900);
    const early = { x: king.x, y: king.y, key: king.texture.key };
    scene.cinematic.render(1, 2600);
    const later = { x: king.x, y: king.y, key: king.texture.key };
    const outsideDoor = king.depth > door.depth;
    const cinematicRope = cast.list.find((object: any) => object.name === 'guard-rope-cinematic');
    const cinematicBound = cinematicRope.visible && cinematicRope.commandBuffer.length > 0;
    scene.endingRunner.restore({ cutsceneId: 'forest.ending', version: 1, stepIndex: 1, elapsedMs: 2600 });
    scene.story.endingStep = 1;
    const checkpoint = scene.snapshot(); scene.restore(checkpoint);
    const restoredKing = scene.children.getByName('pointlesh-cinematic').list[0].list.find((object: any) => object.name === 'cinematic-king');
    const restored = { x: restoredKing.x, y: restoredKing.y, key: restoredKing.texture.key };
    scene.scene.pause(); scene.game.loop.wake();
    return { unbound, bound, outsideCamp, returned, early, later, insideDoor, outsideDoor, cinematicBound, restored };
  });
  expect(result.unbound).toBe(false);
  expect(result.bound).toMatchObject({ visible: true, flag: true, inventory: ['pickaxe'] });
  expect(result.bound.commands).toBeGreaterThan(0);
  expect(result.outsideCamp).toBe(false); expect(result.returned).toBe(true);
  expect(result.cinematicBound).toBe(true);
  expect(result.insideDoor).toBe(true); expect(result.outsideDoor).toBe(true);
  expect(result.later.x).toBeLessThan(result.early.x); expect(result.later.y).toBeGreaterThan(result.early.y);
  expect(result.early.key).toMatch(/king\.walk-left/); expect(result.later.key).toMatch(/king\.walk-left/);
  expect(result.restored).toEqual(result.later);
  await page.screenshot({ path: testInfo.outputPath('bound-guard-king-walking-out.png') });
});
