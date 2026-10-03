import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('orcs point their existing spears, the king surrenders, and the poses survive save/load', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  const result = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.game.loop.sleep();
    const opaqueEdges = (sprite: any) => {
      const frame = sprite.frame, canvas = document.createElement('canvas');
      canvas.width = frame.cutWidth; canvas.height = frame.cutHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = Infinity, right = -Infinity;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] <= 16) continue;
        const local = frame.x + x;
        const edge = sprite.x + ((sprite.flipX ? sprite.width - local - 1 : local) - sprite.displayOriginX) * sprite.scaleX;
        left = Math.min(left, edge); right = Math.max(right, edge);
      }
      return { opaqueLeft: left, opaqueRight: right };
    };
    const view = () => {
      const world = scene.children.getByName('pointlesh-cinematic').list[0];
      return { props: world.getByName('cutscene-props').commandBuffer.length,
        cast: world.list.filter((object: any) => object.name.startsWith('cinematic-') && object.visible)
          .map((sprite: any) => ({ id: sprite.name, texture: sprite.texture.key, frame: sprite.frame.name,
            flip: sprite.flipX, x: sprite.x, y: sprite.y, width: sprite.displayWidth, height: sprite.displayHeight, ...opaqueEdges(sprite) })) };
    };
    const shot = (elapsedMs: number, stepIndex = 0) => {
      scene.story.introStep = stepIndex;
      scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex, elapsedMs });
      scene.renderCutscene();
      return view();
    };
    const start = shot(0), early = shot(300), moving = shot(600);
    const approaching = shot(2000), pointing = shot(3100), surrendering = shot(4000), held = shot(5100), later = shot(5600);
    const save = scene.snapshot();
    shot(500, 2); scene.restore(save);
    const restored = view();
    const otherShots = [1, 2].map(index => shot(Math.min(5300, scene.introRunner.definition.steps[index].durationMs - 1), index));
    shot(5100);
    scene.scene.pause(); scene.game.loop.wake();
    return { start, early, moving, approaching, pointing, surrendering, held, later, restored, otherShots };
  });
  const actor = (shot: any, name: string) => shot.cast.find((sprite: any) => sprite.id === `cinematic-${name}`);
  const earlyTravel = actor(result.start, 'guard-front').x - actor(result.early, 'guard-front').x;
  const nextTravel = actor(result.early, 'guard-front').x - actor(result.moving, 'guard-front').x;
  expect(earlyTravel).toBeGreaterThan(15); expect(nextTravel).toBeCloseTo(earlyTravel, 3);
  for (const shot of [result.surrendering, result.held]) {
    const king = actor(shot, 'king'), rear = actor(shot, 'guard-rear'), front = actor(shot, 'guard-front');
    expect(king.x).toBeLessThan(420);
    expect(rear.opaqueRight).toBeLessThan(king.opaqueLeft - 12);
    expect(front.opaqueLeft).toBeGreaterThan(king.opaqueRight + 12);
  }
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
