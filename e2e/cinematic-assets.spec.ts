import { expect, test } from '@playwright/test';
import { expectCinematicCleanup } from './cinematic-helpers';

test('intro and ending use authored character clips, live previews, and deterministic saved frames', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep this regression independent of unpublished artwork and local services.
  await page.route('**/authoring/*.json', route => route.fulfill({ status: 404, body: '' }));
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();

  const result = await page.evaluate(() => {
    const demo = (window as any).pointleshDemo, scene = demo.scene;
    scene.game.loop.sleep();
    const cast = () => scene.children.getByName('pointlesh-cinematic').list[0].list
      .filter((object: any) => object.name.startsWith('cinematic-') && object.visible)
      .map((sprite: any) => ({ id: sprite.name, texture: sprite.texture.key, frame: sprite.frame.name,
        animation: sprite.anims.currentAnim?.key, flip: sprite.flipX, x: sprite.x, y: sprite.y,
        scaleX: sprite.scaleX, scaleY: sprite.scaleY, originX: sprite.originX, originY: sprite.originY }));
    const shot = (kind: string, stepIndex: number, elapsedMs = 230) => {
      scene.story.introStep = kind === 'intro' ? stepIndex : 4;
      scene.story.endingStep = kind === 'ending' ? stepIndex : -1;
      const other = kind === 'intro' ? 'ending' : 'intro';
      scene[`${other}Runner`].restore({ cutsceneId: `forest.${other}`, version: 1, stepIndex: other === 'intro' ? 4 : 0, elapsedMs: 0 });
      scene[`${kind}Runner`].restore({ cutsceneId: `forest.${kind}`, version: 1, stepIndex, elapsedMs });
      scene.renderCutscene();
      return cast();
    };
    const intro = [0, 1, 2, 3].map(index => shot('intro', index));
    const ending = [0, 1, 2, 3].map(index => shot('ending', index));
    const savedPose = shot('ending', 2, 1234);
    const checkpoint = scene.snapshot();
    shot('intro', 0, 987);
    scene.restore(checkpoint);
    const restoredPose = cast();

    // Prefab direction overrides must reach both orcs, independently flipped.
    const manifest = demo.manifest;
    const walk = manifest.prefabs['forest.character.guard'].pointlesh.properties.animations.walk;
    walk.left = { assetId: 'borin', key: 'walk-front' };
    walk.right = { assetId: 'borin', key: 'walk-front', flipX: true };
    demo.setManifest(manifest);
    const overridden = shot('intro', 0);
    const clip = scene.aiRuntime.manifest.assets['borin.walk-front'];
    const grid = clip.frameGrid;
    scene.textures.addSpriteSheet('cinematic-preview', scene.textures.get(scene.aiRuntime.key(clip.id)).getSourceImage(), {
      frameWidth: grid.frameWidth, frameHeight: grid.frameHeight,
    });
    scene.aiRuntime.designerCallbacks().onPreview(clip.id, 'cinematic-preview', clip);
    const preview = shot('intro', 0);
    scene.aiRuntime.designerCallbacks().onAssetReady(clip.id, clip.id, clip);
    const promoted = shot('intro', 0);
    const sprites = scene.children.getByName('pointlesh-cinematic').list[0].list
      .filter((object: any) => object.name.startsWith('cinematic-'));
    scene.advanceCutscene(true);
    const destroyed = sprites.every((sprite: any) => !sprite.scene);
    scene.game.loop.wake();
    return { intro, ending, savedPose, restoredPose, overridden, preview, promoted, destroyed };
  });

  for (const shot of [...result.intro, ...result.ending]) {
    expect(shot.length).toBeGreaterThan(0);
    for (const actor of shot) {
      expect(actor.texture).toBe(actor.animation);
      expect(actor.animation).toMatch(/\.(walk|idle|speak)-(front|left|back)$/);
    }
  }
  const actor = (shot: any[], id: string) => shot.find(value => value.id === `cinematic-${id}`);
  expect(actor(result.intro[0], 'guard-front')).toMatchObject({ animation: 'guard.walk-left', flip: false });
  expect(actor(result.intro[0], 'guard-rear')).toMatchObject({ animation: 'guard.walk-left', flip: true });
  expect(actor(result.intro[3], 'elder').animation).toBe('elder.speak-front');
  expect(actor(result.ending[3], 'elder').animation).toBe('elder.speak-front');
  expect(result.restoredPose).toEqual(result.savedPose);
  for (const id of ['guard-front', 'guard-rear']) {
    expect(actor(result.overridden, id).animation).toBe('borin.walk-front');
    expect(actor(result.preview, id).texture).toBe('cinematic-preview');
    expect(actor(result.promoted, id).texture).toBe('borin.walk-front');
  }
  expect(result.destroyed).toBe(true);
  await expectCinematicCleanup(page);
  expect(errors).toEqual([]);
});
