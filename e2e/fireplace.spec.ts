import { expect, test } from '@playwright/test';
import { selectInstance, expandProperties } from './designer-helpers';

test.beforeEach(async ({ page }) => {
  await page.route('**/authoring/*.json', route => route.fulfill({ status: 404, body: '' }));
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => (window as any).pointleshDemo.scene.changeRoom('pub'));
});

test('ambient objects loop every frame, pause, hold one-shot endings, update previews and clean up on room changes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep();
    const sprite = scene.entitySprites.get('pub.fireplace'), binding = scene.objectAnimations.get('pub.fireplace');
    const frame = () => Number(sprite.frame.name);
    const edit = (properties: any, placement = {}) => {
      const manifest = api.manifest, instance = manifest.scenes.pub.layers[0].prefabs.find((entry: any) => entry.id === 'pub.fireplace');
      instance.pointlesh = { properties: { ...instance.pointlesh?.properties, ...properties } };
      Object.assign(instance.overrides.object, placement); api.setManifest(manifest);
    };
    const originalWidth = sprite.displayWidth;
    // Restart at the exact first frame for deterministic sampling.
    edit({ animationKey: '' }); edit({ animationKey: 'burn' });
    const liveBinding = scene.objectAnimations.get('pub.fireplace');
    const light = () => scene.children.getByName('pointlesh-light:pub.fireplace');
    const lightPose = () => ({ alpha: light().alpha, x: light().x, y: light().y });
    const frames = [frame()], lights = [light().alpha];
    for (let i = 0; i < 8; i++) { liveBinding.update(125); frames.push(frame()); lights.push(light().alpha); }
    edit({ animationPlaying: false }); liveBinding.update(5000); const paused = frame(), pausedLight = light().alpha;
    edit({ animationPlaying: true }); liveBinding.update(125); const resumed = frame();
    edit({ animationLoop: false }); liveBinding.update(10000); const held = frame();
    edit({ animationLoop: true }, { x: 620, y: 265, scaleX: 1.2, scaleY: 1.3 });
    const placement = [sprite.x, sprite.y, sprite.displayWidth, sprite.displayHeight];
    const lightPlacement = lightPose();
    const lightTexture = scene.textures.get(light().texture.key);
    const pixels = lightTexture.context.getImageData(0, 0, lightTexture.width, lightTexture.height).data;
    const edgeAlpha = [pixels[3], pixels[(lightTexture.width - 1) * 4 + 3], pixels.at(-1)];
    edit({ lightEnabled: false }); const lightDisabled = !light().visible;
    edit({ lightEnabled: true });
    // Live asset previews use the same frame sizing/transform path as characters.
    const preview = structuredClone(scene.aiRuntime.manifest.assets['fireplace.burn']);
    preview.animations[0].frames = [5]; preview.animations[0].frameTimings = [{ scaleX: .5, rotation: 8 }];
    scene.aiRuntime.designerCallbacks().onPreview('fireplace.burn', scene.aiRuntime.key('fireplace.burn'), preview);
    liveBinding.sync();
    const previewPose = { frame: frame(), width: sprite.displayWidth, angle: sprite.angle };
    edit({ animationKey: '' }); const base = sprite.texture.key, lightRemoved = !light();
    const listeners = scene.events.listenerCount('update');
    scene.changeRoom('village');
    const removed = scene.objectAnimations.size;
    scene.changeRoom('pub');
    const returned = scene.entitySprites.get('pub.fireplace').texture.key;
    const afterListeners = scene.events.listenerCount('update');
    binding.update(100); // A destroyed binding must stay detached.
    scene.game.loop.wake();
    return { frames, lights, pausedLight, lightPlacement, edgeAlpha, lightDisabled, lightRemoved,
      paused, resumed, held, placement, previewPose, base, originalWidth, removed, returned, listeners, afterListeners };
  });
  expect(result.frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  expect(result.paused).toBe(0); expect(result.resumed).toBe(1); expect(result.held).toBe(7);
  expect(new Set(result.lights).size).toBeGreaterThan(5);
  expect(result.lights[2]).toBeCloseTo(.8); expect(result.lights[4]).toBeCloseTo(.16);
  expect(result.pausedLight).toBe(result.lights[0]);
  expect(result.lightPlacement).toMatchObject({ x: 620, y: 258 });
  expect(result.edgeAlpha).toEqual([0, 0, 0]); expect(result.lightDisabled).toBe(true); expect(result.lightRemoved).toBe(true);
  expect(result.originalWidth).toBeCloseTo(80 * 960 / 1182);
  expect(result.placement.slice(0, 3)).toEqual([620, 265, 96]); expect(result.placement[3]).toBeCloseTo(135.2);
  expect(result.previewPose.frame).toBe(5); expect(result.previewPose.width).toBeCloseTo(48); expect(result.previewPose.angle).toBeCloseTo(8);
  expect(result.base).toBe('fireplace'); expect(result.removed).toBe(0); expect(result.returned).toBe('fireplace');
  expect(result.afterListeners).toBe(result.listeners);
});

test('the fireplace keeps playing with the designer open and exposes object animation controls', async ({ page }, testInfo) => {
  await selectInstance(page, 'pub.fireplace');
  await expandProperties(page, 'Animation');
  await expect(page.getByRole('combobox', { name: 'Object animation', exact: true })).toHaveValue('burn');
  await expect(page.getByRole('checkbox', { name: 'Loop animation', exact: true })).toBeChecked();
  const observed = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene, frames = new Set();
    for (let i = 0; i < 12; i++) {
      frames.add(scene.entitySprites.get('pub.fireplace').frame.name);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return [...frames];
  });
  expect(observed.length).toBeGreaterThan(5);
  await page.getByRole('checkbox', { name: 'Play animation', exact: true }).uncheck();
  const frozen = await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('pub.fireplace').frame.name);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('pub.fireplace').frame.name)).toBe(frozen);
  await page.getByRole('checkbox', { name: 'Play animation', exact: true }).check();
  await page.getByRole('combobox', { name: 'Object animation', exact: true }).selectOption('');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('pub.fireplace').texture.key)).toBe('fireplace');
  await page.getByRole('combobox', { name: 'Object animation', exact: true }).selectOption('burn');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.entitySprites.get('pub.fireplace').texture.key)).toBe('fireplace.burn');
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('copper-tankard-fireplace.png') });
});
