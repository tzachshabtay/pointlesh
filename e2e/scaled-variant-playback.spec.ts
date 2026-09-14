import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ deviceScaleFactor: 2 });

test('Current retains saved variants through walking and idle transitions', async ({ page }) => {
  const catalog = JSON.parse(await readFile('demos/forest/public/authoring/assets.json', 'utf8'));
  // Reuse a tracked sheet so this regression is independent of local generations.
  const idle = catalog.assets['borin.idle-front'];
  const variant = Object.values(idle.versions[idle.activeVersion].scaledVariants)[0] as any;
  const walk = catalog.assets['borin.walk-front'];
  walk.versions[walk.activeVersion].scaledVariants = { fixture: { ...variant, id: 'fixture' } };
  await page.route('**/authoring/assets.json', route => route.fulfill({ json: catalog }));
  await page.route('**/__ai-assets/manifest', route => route.fulfill({ json: catalog }));
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.getByRole('button', { name: /Graphics$/ }).click();
  await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
  await page.getByRole('button', { name: 'Borin', exact: true }).click();
  for (const [id, label] of [['borin.walk-front', 'Walk'], ['borin.idle-front', 'Idle']]) {
    await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption(id!);
    await page.getByRole('img', { name: `Borin ${label} Front active version`, exact: true }).click();
    await page.getByRole('dialog', { name: `Edit Borin ${label} Front animation`, exact: true })
      .getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('pub');
    scene.character.state.position = { x: 470, y: 390 };
  });
  const texture = () => page.evaluate(() => (window as any).pointleshDemo.scene.actor.texture.key);
  await expect.poll(texture).toMatch(/^borin.idle-front::scaled::/);
  await page.keyboard.down('ArrowDown');
  await expect.poll(texture).toMatch(/^borin.walk-front::scaled::/);
  await page.keyboard.up('ArrowDown');
  await expect.poll(texture).toMatch(/^borin.idle-front::scaled::/);
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.actor.frame.cutWidth)).toBe(96);
});

test('animated variants cannot redraw scenery outside the character', async ({ page }) => {
  const catalog = JSON.parse(await readFile('demos/forest/public/authoring/assets.json', 'utf8'));
  const initial = structuredClone(catalog);
  for (const asset of Object.values(initial.assets) as any[]) delete asset.versions[asset.activeVersion]?.scaledVariants;
  await page.route('**/authoring/assets.json', route => route.fulfill({ json: initial }));
  await page.route('**/__ai-assets/manifest', route => route.fulfill({ json: initial }));
  await page.goto('/?designer=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
  await page.evaluate(catalog => (window as any).pointleshDemo.scene.aiRuntime.syncManifest(catalog), catalog);
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.actor.texture.key)).toMatch(/::scaled::/);
  const differences = await page.evaluate(async () => {
    const scene = (window as any).pointleshDemo.scene;
    scene.changeRoom('pub');
    scene.sys.pause();
    scene.character.state.position = { x: 430, y: 490 };
    scene.binding.sync();
    scene.aiRuntime.onScaledUpdate();
    const pixels = async () => {
      const image = await new Promise<HTMLImageElement>(resolve => scene.renderer.snapshot(resolve));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width };
    };
    scene.actor.setVisible(false);
    const baseline = await pixels();
    scene.actor.setVisible(true);
    const camera = scene.cameras.main, bounds = scene.actor.getBounds();
    const topLeft = camera.matrix.transformPoint(bounds.left, bounds.top);
    const bottomRight = camera.matrix.transformPoint(bounds.right, bounds.bottom);
    const sx = scene.game.canvas.width / scene.scale.gameSize.width;
    const sy = scene.game.canvas.height / scene.scale.gameSize.height;
    const results = [];
    for (let frame = 0; frame < 8; frame++) {
      scene.character.state.animationFrame = frame;
      scene.binding.sync();
      scene.aiRuntime.onScaledUpdate();
      const sourceFrame = scene.actor.frame;
      const alphaCanvas = document.createElement('canvas');
      alphaCanvas.width = sourceFrame.cutWidth; alphaCanvas.height = sourceFrame.cutHeight;
      const alphaContext = alphaCanvas.getContext('2d')!;
      alphaContext.drawImage(scene.actor.texture.getSourceImage(), sourceFrame.cutX, sourceFrame.cutY,
        sourceFrame.cutWidth, sourceFrame.cutHeight, 0, 0, sourceFrame.cutWidth, sourceFrame.cutHeight);
      const alpha = alphaContext.getImageData(0, 0, alphaCanvas.width, alphaCanvas.height).data;
      const worldMatrix = scene.actor.getWorldTransformMatrix();
      const next = await pixels(); let outside = 0, inside = 0, transparent = 0;

      for (let index = 0; index < next.data.length; index += 4) {
        if ([0, 1, 2, 3].every(c => next.data[index + c] === baseline.data[index + c])) continue;
        const x = index / 4 % next.width, y = Math.floor(index / 4 / next.width);
        if (x >= topLeft.x * sx - 2 && x <= bottomRight.x * sx + 2 && y >= topLeft.y * sy - 2 && y <= bottomRight.y * sy + 2) inside++;
        else outside++;
        const world = camera.matrix.applyInverse((x + .5) / sx, (y + .5) / sy);
        const local = worldMatrix.applyInverse(world.x, world.y);
        const ax = Math.floor(local.x + scene.actor.displayOriginX), ay = Math.floor(local.y + scene.actor.displayOriginY);
        if (ax >= 1 && ay >= 1 && ax < alphaCanvas.width - 1 && ay < alphaCanvas.height - 1) {
          let clear = true;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (alpha[((ay + dy) * alphaCanvas.width + ax + dx) * 4 + 3]) clear = false;
          }
          if (clear) transparent++;
        }
      }
      results.push({ frame, inside, outside, transparent });
    }
    return results;
  });
  for (const diff of differences) {
    expect(diff.inside, JSON.stringify(diff)).toBeGreaterThan(0);
    expect(diff.outside, JSON.stringify(diff)).toBe(0);
    expect(diff.transparent, JSON.stringify(diff)).toBe(0);
  }
});
