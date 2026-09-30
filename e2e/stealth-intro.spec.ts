import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';
import { isWalkable, walkablePolygons, resolvePointleshScene } from '@pointlesh/core';

test('intro walks stay on authored ground and Borin leaves through the animated cottage door', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  const result = await page.evaluate(async () => {
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep();
    const samples = [], doorFrames = new Set(), actors = [];
    for (const step of [1, 3]) for (let ms = 0; ms <= (step === 1 ? 10000 : 8500); ms += 100) {
      scene.cinematic.render(step, ms);
      const shot = scene.cinematic.snapshot();
      for (const actor of shot.cast.filter((actor: any) => actor.visible && (step === 1 || actor.id === 'borin'))) {
        samples.push({ step, ms, actor });
        if (step === 1 && ms === 5000) actors.push(actor);
      }
      if (step === 3) {
        const world = scene.children.getByName('pointlesh-cinematic').list[0];
        doorFrames.add(world.getByName('cutscene-door-village.door.village-house').frame.name);
      }
    }
    scene.cinematic.render(1, 5000); scene.scene.pause(); scene.game.loop.wake();
    return { samples, doorFrames: [...doorFrames], actors, manifest: api.manifest };
  });
  const forest = resolvePointleshScene(result.manifest, 'forest'), village = resolvePointleshScene(result.manifest, 'village');
  const villageFloors = walkablePolygons({ ...village, areas: village.areas.map(area => area.id === 'village.transition.to-house' ? { ...area, enabled: true } : area) });
  for (const { step, ms, actor } of result.samples) expect(isWalkable(actor, step === 1 ? walkablePolygons(forest) : villageFloors), `step ${step}, ${ms}ms, ${actor.id}`).toBe(true);
  expect(result.actors).toHaveLength(3);
  expect(result.doorFrames).toContain(0); expect(result.doorFrames).toContain(7); expect(result.doorFrames.length).toBeGreaterThan(4);
  await page.screenshot({ path: testInfo.outputPath('forest-march.png') });
  await page.evaluate(() => (window as any).pointleshDemo.scene.cinematic.render(3, 1800));
  await page.screenshot({ path: testInfo.outputPath('cottage-departure.png') });
  expect(errors).toEqual([]);
});

test('camp entry peeks, blocks roaming, permits the poison trip and restores every stealth phase', async ({ page }, testInfo) => {
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const arrival = await page.evaluate(async () => {
    const { forestPortal } = await import('/src/transition-content.ts' as string);
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep(); scene.changeRoom('forest');
    scene.character.place(forestPortal(api.manifest, 'forest', 'camp').path[0]); scene.binding.sync();
    scene.applyInteraction('camp-path');
    const frames = new Set();
    for (let i = 0; i < 300 && scene.roomTransition.active; i++) {
      scene.update(0, 50);
      const portal = scene.roomTransition.portal;
      if (portal?.doorId) frames.add(scene.entitySprites.get(portal.doorId).frame.name);
    }
    scene.update(0, 50);
    const result = { room: scene.story.roomId, peeking: scene.peeking(), pos: { ...scene.character.state.position }, expected: scene.campCover(), frames: [...frames], key: scene.actor.texture.key };
    scene.scene.pause(); scene.game.loop.wake(); return result;
  });
  expect(arrival).toMatchObject({ room: 'camp', peeking: true, pos: arrival.expected });
  expect(Math.max(...arrival.frames as number[])).toBe(3); expect(arrival.key).toContain('borin.peek');
  await page.screenshot({ path: testInfo.outputPath('camp-peeking.png') });
  const canvas = await page.locator('#game canvas').boundingBox();
  await page.mouse.click(canvas!.x + canvas!.width * .6, canvas!.y + canvas!.height * .8);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => (window as any).pointleshDemo.scene.update(0, 100));
  await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.character.state.position)).toEqual(arrival.pos);
  const result = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep(); scene.scene.resume();
    await scene.act('guard'); const refused = { ...scene.character.state.position }; scene.dismissSpeech();
    scene.story.inventory.push('sleepyStout'); scene.selected = 'sleepyStout';
    scene.guardPatrol.phase = 'idle-back'; scene.story.flags.guardDistracted = true;
    // Hold the distraction to test trip/save behavior independently of patrol timing.
    scene.guardPatrol.update = () => {};
    await scene.act('cauldron');
    const phases = new Set(), restored = [];
    for (let i = 0; i < 1500 && scene.campStealth.busy; i++) {
      const phase = scene.campStealth.snapshot().phase;
      if (!phases.has(phase)) {
        const save = scene.snapshot(); scene.restore(save);
        restored.push(JSON.stringify(save) === JSON.stringify(scene.snapshot()));
        scene.guardPatrol.update = () => {};
      }
      phases.add(phase); scene.update(0, 50);
    }
    const spiked = !!scene.story.flags.stewSpiked, returned = { ...scene.character.state.position };
    scene.dismissSpeech(); scene.story.flags.guardAsleep = true;
    for (let i = 0; i < 300 && (scene.campStealth.peeking || scene.campStealth.busy); i++) scene.update(0, 50);
    return { refused, phases: [...phases], restored, spiked, returned, inventory: scene.story.inventory, restricted: scene.campRestricted(), busy: scene.campStealth.busy };
  });
  expect(result.refused).toEqual(arrival.pos); expect(result.phases).toEqual(['outbound', 'return']);
  expect(result.restored).toEqual([true, true]); expect(result.spiked).toBe(true);
  expect(result.returned).toEqual(arrival.pos); expect(result.inventory).not.toContain('sleepyStout');
  expect(result).toMatchObject({ restricted: false, busy: false });
});

test('the live guard patrol gives the hidden hero time to poison the stew and retreat', async ({ page }) => {
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const result = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep(); scene.changeRoom('camp'); scene.story.inventory.push('sleepyStout'); scene.selected = 'sleepyStout';
    for (let i = 0; i < 1500 && scene.guardPatrol.phase !== 'idle-back'; i++) scene.update(0, 50);
    const start = scene.guardPatrol.phase;
    await scene.act('cauldron'); let tripMs = 0;
    for (let i = 0; i < 1500 && scene.campStealth.busy; i++) { scene.update(0, 50); tripMs += 50; }
    const message = document.getElementById('speech')!.textContent;
    scene.dismissSpeech();
    for (let i = 0; i < 2000 && !scene.story.flags.guardAsleep; i++) scene.update(0, 50);
    return { start, tripMs, message, spiked: !!scene.story.flags.stewSpiked, asleep: !!scene.story.flags.guardAsleep };
  });
  expect(result, JSON.stringify(result)).toMatchObject({ start: 'idle-back', spiked: true, asleep: true });
});
