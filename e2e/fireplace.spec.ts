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

test('the cottage fire loops behind its pot with synchronized light and survives room changes', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep(); scene.changeRoom('house');
    const sprite = scene.entitySprites.get('house.fireplace'), binding = scene.objectAnimations.get('house.fireplace');
    const light = () => scene.children.getByName('pointlesh-light:house.fireplace');
    const fire = scene.resolved().objects.find((object: any) => object.id === 'house.fireplace');
    const kettle = scene.resolved().areas.find((area: any) => area.id === 'house.hearth-kettle');
    const poses = [];
    for (let i = 0; i < 9; i++) {
      poses.push({ frame: sprite.frame.name, light: light().alpha }); binding.update(125);
    }
    const result = { poses, key: sprite.texture.key, background: scene.background.texture.key,
      width: sprite.displayWidth, potInFront: scene.overlays.some((overlay: any) => overlay.image.depth === kettle.properties.baseline && overlay.image.depth > sprite.depth),
      potLit: light().depth > kettle.properties.baseline, lightBehindPlayer: light().depth < scene.actor.depth, linkedAsset: fire.assetId };
    scene.changeRoom('pub');
    const cleaned = !scene.children.getByName('pointlesh-light:house.fireplace') && !scene.objectAnimations.has('house.fireplace');
    scene.changeRoom('house');
    const restored = { key: scene.entitySprites.get('house.fireplace').texture.key, light: !!light() };
    scene.game.loop.wake(); return { ...result, cleaned, restored };
  });
  expect(result.poses.map(pose => pose.frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  expect(result.poses[2].light).toBeCloseTo(.7); expect(result.poses[4].light).toBeCloseTo(.14);
  expect(result.width).toBeCloseTo(80 * .72 * 960 / 1182);
  expect(result).toMatchObject({ key: 'fireplace.burn', background: 'room.house', linkedAsset: 'fireplace', potInFront: true, potLit: true, lightBehindPlayer: true, cleaned: true,
    restored: { key: 'fireplace.burn', light: true } });
  await selectInstance(page, 'house.fireplace'); await expandProperties(page, 'Animation');
  await expect(page.getByRole('combobox', { name: 'Object animation', exact: true })).toHaveValue('burn');
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('cottage-fireplace.png') });
});

test('the cauldron fire lights the pot and ground beneath the actors without intercepting the puzzle', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  const result = await page.evaluate(() => {
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep(); scene.changeRoom('camp');
    const sprite = scene.entitySprites.get('camp.fireplace'), binding = scene.objectAnimations.get('camp.fireplace');
    const light = () => scene.children.getByName('pointlesh-light:camp.fireplace');
    const cauldron = scene.resolved().areas.find((area: any) => area.id === 'camp.hearth-cauldron');
    const frames = [], brightness = [];
    for (let i = 0; i < 9; i++) {
      frames.push(sprite.frame.name); brightness.push(light().alpha); binding.update(125);
    }
    const potInFront = scene.overlays.some((overlay: any) => overlay.image.depth === cauldron.properties.baseline && overlay.image.depth > sprite.depth);
    const result = { frames, brightness, key: sprite.texture.key, width: sprite.displayWidth,
      potInFront, potLit: light().depth > cauldron.properties.baseline, lightBelowGuard: light().depth < 350,
      // Input remains registered so properties can change live. Its hit callback
      // must reject the fire's opaque pixels during ordinary gameplay.
      acceptsHits: Array.from({ length: sprite.frame.realWidth * sprite.frame.realHeight }, (_, i) =>
        sprite.input.hitAreaCallback(sprite.input.hitArea, i % sprite.frame.realWidth, Math.floor(i / sprite.frame.realWidth), sprite)).some(Boolean),
      hasDoor: scene.entitySprites.has('camp.cage-door'),
      hasCauldronHotspot: scene.resolved().areas.some((area: any) => area.id === 'cauldron' && area.enabled),
      backgroundFile: scene.aiRuntime.manifest.assets['background.camp'].versions[scene.aiRuntime.manifest.assets['background.camp'].activeVersion].file };
    scene.changeRoom('forest');
    const cleaned = !scene.children.getByName('pointlesh-light:camp.fireplace') && !scene.objectAnimations.has('camp.fireplace');
    scene.changeRoom('camp'); scene.game.loop.wake();
    return { ...result, cleaned };
  });
  expect(result.frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  expect(result.brightness[2]).toBeCloseTo(.8); expect(result.brightness[4]).toBeCloseTo(.16);
  expect(result.width).toBeCloseTo(80 * 1.6 * 960 / 1182);
  expect(result).toMatchObject({ key: 'fireplace.burn', potInFront: true, potLit: true, lightBelowGuard: true,
    acceptsHits: false, hasDoor: true, hasCauldronHotspot: true, cleaned: true, backgroundFile: 'art/camp-unlit.png' });
  await selectInstance(page, 'camp.fireplace'); await expandProperties(page, 'Animation');
  await expect(page.getByRole('combobox', { name: 'Object animation', exact: true })).toHaveValue('burn');
  await expect(page.getByRole('checkbox', { name: 'Loop animation', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('camp-cauldron-fire.png') });
});
