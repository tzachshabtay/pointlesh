import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('orcs point their existing spears, the king surrenders, and the poses survive save/load', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep();
    const view = () => {
      const world = scene.children.getByName('pointlesh-cinematic').list[0];
      return { props: world.getByName('cutscene-props').commandBuffer.length,
        cast: world.list.filter((object: any) => object.name.startsWith('cinematic-') && object.visible)
          .map((sprite: any) => ({ id: sprite.name, texture: sprite.texture.key, frame: sprite.frame.name,
            flip: sprite.flipX, x: sprite.x, y: sprite.y, width: sprite.displayWidth, height: sprite.displayHeight })) };
    };
    const shot = (elapsedMs: number, stepIndex = 0) => {
      scene.story.introStep = stepIndex;
      scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex, elapsedMs });
      scene.renderCutscene();
      return view();
    };
    const approaching = shot(2000), pointing = shot(3100), surrendering = shot(4000), held = shot(5100), later = shot(5600);
    const save = scene.snapshot();
    shot(500, 2); scene.restore(save);
    const restored = view();
    const otherShots = [1, 2, 3].map(index => shot(5300, index));
    shot(5100);
    scene.scene.pause(); scene.game.loop.wake();
    return { approaching, pointing, surrendering, held, later, restored, otherShots };
  });
  const actor = (shot: any, name: string) => shot.cast.find((sprite: any) => sprite.id === `cinematic-${name}`);
  expect(actor(result.approaching, 'guard-front').texture).toBe('guard.walk-left');
  expect(actor(result.pointing, 'guard-front')).toMatchObject({ texture: 'guard.point-spear', frame: 0, flip: false });
  expect(actor(result.pointing, 'guard-rear')).toMatchObject({ texture: 'guard.point-spear', frame: 0, flip: true });
  expect(actor(result.pointing, 'king').texture).toBe('king.idle-front');
  expect(actor(result.surrendering, 'king').texture).toBe('king.hands-up');
  for (const id of ['guard-front', 'guard-rear', 'king']) {
    expect(actor(result.held, id).frame).toBe(7);
    expect(actor(result.later, id)).toEqual(actor(result.held, id));
  }
  expect(result.restored).toEqual(result.later);
  for (const shot of [result.approaching, result.pointing, result.surrendering, result.held, ...result.otherShots]) {
    expect(shot.props).toBe(0); // No procedural spears, ropes or arm gestures remain in any intro shot.
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('intro-surrender.png') });
});
