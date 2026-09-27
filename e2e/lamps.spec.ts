import { expect, test } from '@playwright/test';
import { selectInstance, expandProperties } from './designer-helpers';

test.beforeEach(async ({ page }) => {
  await page.route('**/authoring/*.json', route => route.fulfill({ status: 404, body: '' }));
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
});

test('all sixteen lamps animate and light their rooms, including both ends of the scrolling forest', async ({ page }, testInfo) => {
  const counts: Record<string, number> = { village: 1, pub: 5, house: 3, mine: 3, forest: 4 };
  for (const [room, count] of Object.entries(counts)) {
    const result = await page.evaluate(room => {
      const scene = (window as any).pointleshDemo.scene; scene.game.loop.sleep(); scene.changeRoom(room);
      const lamps = [...scene.entitySprites].filter(([id]: [string]) => id.includes('.lamp.'));
      const samples = lamps.map(([id, sprite]: any) => {
        const binding = scene.objectAnimations.get(id), light = scene.children.getByName(`pointlesh-light:${id}`);
        const frames = new Set(), brightness = new Set();
        for (let i = 0; i < 32; i++) { binding.update(80); frames.add(sprite.frame.name); brightness.add(light.alpha); }
        return { id, frames: frames.size, brightness: brightness.size, visible: sprite.visible && light.visible,
          belowActor: light.depth < scene.actor.depth, key: sprite.texture.key, width: sprite.displayWidth };
      });
      const lights = scene.children.list.filter((item: any) => item.name.startsWith('pointlesh-light:') && item.name.includes('.lamp.')).length;
      scene.game.loop.wake(); return { samples, lights };
    }, room);
    expect(result.samples).toHaveLength(count); expect(result.lights).toBe(count);
    for (const lamp of result.samples) {
      expect(lamp.frames).toBe(8); expect(lamp.brightness).toBeGreaterThan(5);
      expect(lamp.visible).toBe(true); expect(lamp.belowActor).toBe(true); expect(lamp.key).toMatch(/\.burn$/); expect(lamp.width).toBeGreaterThan(1);
    }
    if (room === 'forest') {
      await page.evaluate(() => { const scene = (window as any).pointleshDemo.scene; scene.character.place({ x: 1480, y: 470 }); });
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: testInfo.outputPath(`lamps-${room}.png`) });
  }
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('pub'));
  await selectInstance(page, 'pub.lamp.bar'); await expandProperties(page, 'Animation');
  await expect(page.getByRole('combobox', { name: 'Object animation', exact: true })).toHaveValue('burn');
  await page.getByRole('checkbox', { name: 'Play animation', exact: true }).uncheck();
  const frame = await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('pub.lamp.bar').frame.name);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('pub.lamp.bar').frame.name)).toBe(frame);
});

test('cutscenes use the same lamps and deterministic flicker, with light inside the cinematic camera', async ({ page }) => {
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene; scene.game.loop.sleep();
    scene.story.endingStep = 3;
    scene.endingRunner.restore({ cutsceneId: 'forest.ending', version: 1, stepIndex: 3, elapsedMs: 1000 }); scene.renderCutscene();
    const cinematic = scene.cinematic, world = scene.children.getByName('pointlesh-cinematic').list[0];
    const state = () => {
      const lamp = world.getByName('ambient-village.lamp.tavern'), light = world.getByName('pointlesh-light:village.lamp.tavern');
      return { frame: lamp.frame.name, brightness: light.alpha, key: lamp.texture.key, sameContainer: lamp.parentContainer === light.parentContainer, visible: lamp.visible && light.visible };
    };
    const first = state(); cinematic.render(3, 1450); const second = state(); cinematic.render(3, 1000); const restored = state();
    cinematic.render(0, 1000);
    const changedRoom = !world.getByName('ambient-village.lamp.tavern') && !!world.getByName('ambient-camp.torch');
    scene.advanceCutscene(true); scene.game.loop.wake(); return { first, second, restored, changedRoom };
  });
  expect(result.first).toMatchObject({ key: 'lamp.village.tavern.burn', sameContainer: true, visible: true });
  expect(result.second.frame).not.toBe(result.first.frame); expect(result.second.brightness).not.toBe(result.first.brightness);
  expect(result.restored).toEqual(result.first); expect(result.changedRoom).toBe(true);
});
