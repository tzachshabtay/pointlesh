import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAiAssetDevServer, createOpenAiUpscaleProvider } from '@ai-game-assets/dev';

test('scaled variants CRUD uses the real server and keeps animated actors at their authored size', async ({ page }, testInfo) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pointlesh-scaled-e2e-'));
  const publicDir = path.resolve('demos/forest/public');
  const manifestPath = path.join(root, 'assets.json'), assetsDir = path.join(root, 'art');
  const catalog = JSON.parse(await readFile(path.join(publicDir, 'authoring/assets.json'), 'utf8'));
  await mkdir(assetsDir);
  for (const id of ['borin', 'borin.idle-front', 'background.village-pub']) {
    const asset = catalog.assets[id], version = asset.versions[asset.activeVersion];
    // User-authored variants stay in the real catalog; this fixture starts fresh.
    delete version.scaledVariants;
    delete version.scaledVariantSource;
    const target = path.join(root, version.file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(publicDir, version.file), target);
  }
  await writeFile(manifestPath, JSON.stringify(catalog));
  const imageRequests: string[] = [];
  const upscaleProvider = createOpenAiUpscaleProvider({ apiKey: 'test-openai-key', fetch: async (url, options) => {
    expect(String(url)).toBe('https://api.openai.com/v1/images/edits');
    const form = options!.body as FormData;
    expect(form.get('model')).toBe('gpt-image-2.5-sunburst');
    imageRequests.push(String(form.get('prompt')));
    const source = Buffer.from(await (form.get('image') as Blob).arrayBuffer());
    if (String(form.get('prompt')).includes('ONE animation spritesheet')) {
      const grid = catalog.assets['borin.idle-front'].frameGrid;
      // The PNG attachment must contain the entire packed sheet, not one frame.
      expect(source.readUInt32BE(16)).toBe(grid.frameWidth * grid.columns);
      expect(source.readUInt32BE(20)).toBe(grid.frameHeight * grid.rows);
    }
    return Response.json({ data: [{ b64_json: source.toString('base64') }] });
  } });
  const server = createAiAssetDevServer({ manifestPath, assetsDir, publicPathPrefix: 'art', port: 0, upscaleProvider });
  await server.listen();
  const address = server.server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  let rejectNextSelection = false;
  let releaseSelection: (() => void) | undefined;
  let holdSelection: Promise<void> | undefined;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, async route => {
      const url = new URL(route.request().url());
      if (url.port !== '4287') return route.abort();
      if (url.pathname === '/__ai-assets/scaled-variant' && route.request().postDataJSON()?.action === 'select') {
        if (rejectNextSelection) {
          rejectNextSelection = false;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test save unavailable' }) });
        }
        if (holdSelection) await holdSelection;
      }
      const response = await route.fetch({ url: base + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await page.route('**/authoring/assets.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(manifestPath, 'utf8') }));
    await page.route('**/art/scaled-*.png', async route => {
      const response = await route.fetch({ url: base + new URL(route.request().url()).pathname });
      await route.fulfill({ response });
    });
    const openBorin = async () => {
      await page.goto('/?designer=1');
      await expect(page.locator('#loading')).toBeHidden();
      await page.getByRole('button', { name: 'Toggle AI asset designer', exact: true }).click();
      await page.getByRole('button', { name: /Graphics$/ }).click();
      await page.locator('.ai-game-assets-designer__asset-folder').filter({ hasText: /^Characters$/ }).click();
      await page.getByRole('button', { name: 'Borin', exact: true }).click();
    };
    await openBorin();
    await page.getByRole('button', { name: 'Scaled variants...', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Scaled variants', exact: true });
    const expectSavedPreview = async () => {
      const preview = dialog.locator('img');
      await expect(preview).toHaveAttribute('src', /^(data:image\/png;base64,|.*art\/scaled-)/);
      await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    };
    await expect(dialog.getByText('No scaled variants yet.')).toBeVisible();
    const candidates = dialog.getByRole('region', { name: 'Generated candidates' });
    const chooseCandidate = async (before: string, animate = false, saveOnClose = false) => {
      await expect(candidates.locator('.ai-game-assets-designer__option')).toHaveCount(3);
      expect(await readFile(manifestPath, 'utf8')).toBe(before);
      await expect(candidates.getByRole('button', { name: 'Promote', exact: true })).toBeDisabled();
      if (animate) {
        await expect(candidates.getByRole('button', { name: 'Animate', exact: true })).toHaveCount(3);
        const first = candidates.locator('.ai-game-assets-designer__option').first();
        await first.getByRole('button', { name: 'Animate', exact: true }).click();
        await expect(first.locator('img')).toBeHidden();
        const position = () => first.locator('.ai-game-assets-designer__option-animation').evaluate(el => (el.firstElementChild as HTMLElement).style.backgroundPosition);
        const initial = await position();
        await expect.poll(position).not.toBe(initial);
        await first.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(first.locator('img')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('animation-candidates.png') });
      } else await expect(candidates.getByRole('button', { name: 'Animate', exact: true })).toHaveCount(0);
      const originalCandidates = await candidates.locator('img').evaluateAll(images => images.map(image => (image as HTMLImageElement).src));
      const callsBeforeReopen = imageRequests.length;
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      await page.getByRole('button', { name: 'Scaled variants...', exact: true }).click();
      await expect(candidates.locator('.ai-game-assets-designer__option')).toHaveCount(3);
      expect(await candidates.locator('img').evaluateAll(images => images.map(image => (image as HTMLImageElement).src))).toEqual(originalCandidates);
      expect(imageRequests).toHaveLength(callsBeforeReopen);
      await candidates.getByRole('img', { name: 'Option 2', exact: true }).click();
      await expect(candidates.getByRole('button', { name: 'Select option 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
      if (saveOnClose) {
        rejectNextSelection = true;
        await dialog.getByRole('button', { name: 'Save and close', exact: true }).click();
        await expect(dialog.getByRole('status')).toContainText('Test save unavailable');
        await expect(dialog).toBeVisible();
        expect(await readFile(manifestPath, 'utf8')).toBe(before);
        await expect(candidates.getByRole('button', { name: 'Select option 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
        holdSelection = new Promise(resolve => { releaseSelection = resolve; });
        await dialog.getByRole('button', { name: 'Save and close', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'Save and close', exact: true })).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        releaseSelection!();
        holdSelection = undefined;
        await expect(dialog).toBeHidden();
        await page.getByRole('button', { name: 'Scaled variants...', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
        expect(imageRequests).toHaveLength(callsBeforeReopen);
      } else await candidates.getByRole('button', { name: 'Promote', exact: true }).click();
      await expect(candidates).toBeHidden();
    };
    await expect(dialog.getByLabel('Scaling method')).toHaveValue('ai-upscale');
    await dialog.getByLabel('Scaling method').selectOption({ label: 'OpenAI image upscale' });
    await expect(dialog.getByText(/Enlargement uses OpenAI/)).toBeVisible();
    await dialog.getByLabel('Width', { exact: true }).fill('96');
    await dialog.getByLabel('Height', { exact: true }).fill('128');
    const beforeFirst = await readFile(manifestPath, 'utf8');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await chooseCandidate(beforeFirst);
    await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expectSavedPreview();
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog.getByLabel('Width', { exact: true }).fill('72');
    await dialog.getByLabel('Height', { exact: true }).fill('96');
    const beforeRegenerate = await readFile(manifestPath, 'utf8');
    await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
    await chooseCandidate(beforeRegenerate, false, true);
    await expect(dialog.locator('strong')).toHaveText('72 × 96');
    await expectSavedPreview();
    expect(imageRequests).toHaveLength(6);
    expect(imageRequests[0]).toContain('96 by 128');
    expect(imageRequests[3]).toContain('72 by 96');
    const aiSaved = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(Object.values(aiSaved.assets.borin.versions[aiSaved.assets.borin.activeVersion].scaledVariants).map((v: any) => v.method)).toEqual(['ai-upscale']);
    await page.screenshot({ path: testInfo.outputPath('scaled-variants.png') });
    await dialog.getByRole('button', { name: 'Touch up…', exact: true }).click();
    const touchup = page.getByRole('dialog', { name: /^Touch up borin/ });
    await expect(touchup).toBeVisible();
    await touchup.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(touchup).toBeHidden();
    await expectSavedPreview();
    const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(Object.values(saved.assets.borin.versions[saved.assets.borin.activeVersion].scaledVariants).map((v: any) => v.method)).toEqual(['touch-up']);
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog.getByText('No scaled variants yet.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('borin.idle-front');
    await page.getByRole('button', { name: 'Scaled variants...', exact: true }).click();
    const actor = () => page.evaluate(() => {
      const actor = (window as any).pointleshDemo.scene.actor;
      return { width: actor.displayWidth, height: actor.displayHeight, frame: actor.frame.name, texture: actor.texture.key };
    });
    const original = await actor();
    await dialog.getByLabel('Frame width', { exact: true }).fill(String(Math.round(original.width)));
    await dialog.getByLabel('Frame height', { exact: true }).fill(String(Math.round(original.height)));
    const beforeAnimation = await readFile(manifestPath, 'utf8');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await chooseCandidate(beforeAnimation, true, true);
    expect(imageRequests).toHaveLength(9);
    for (const prompt of imageRequests.slice(6)) {
      expect(prompt).toContain('ONE animation spritesheet');
      expect(prompt).toContain('SAME character or object');
    }
    await expect(dialog.getByRole('button', { name: 'Animate', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expectSavedPreview();
    await expect(page.getByRole('combobox', { name: 'Animation', exact: true })).toHaveValue('borin.idle-front');
    await expect.poll(async () => (await actor()).texture).toContain('::scaled::');
    const frame = (await actor()).frame;
    await expect.poll(async () => (await actor()).frame).not.toBe(frame);
    expect((await actor()).width).toBeCloseTo(original.width, 3);
    const previousTexture = (await actor()).texture;
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const beforeAnimationReplacement = await readFile(manifestPath, 'utf8');
    await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
    await chooseCandidate(beforeAnimationReplacement, true, true);
    const replaced = JSON.parse(await readFile(manifestPath, 'utf8')).assets['borin.idle-front'];
    const replacementFile = (Object.values(replaced.versions[replaced.activeVersion].scaledVariants)[0] as any).file;
    await expect.poll(async () => (await actor()).texture).toContain(replacementFile);
    expect((await actor()).texture).not.toBe(previousTexture);
    expect((await actor()).width).toBeCloseTo(original.width, 3);
    await openBorin();
    await expect.poll(async () => (await actor()).texture).toContain('::scaled::');
    await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('borin.idle-front');
    await page.getByRole('button', { name: 'Scaled variants...', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog.getByText('No scaled variants yet.')).toBeVisible();
    await expect.poll(async () => (await actor()).texture).not.toContain('::scaled::');
    expect((await actor()).width).toBeCloseTo(original.width, 3);
    // Background variants retain their pixels while the room and masked copies
    // continue to share exactly the same world-space bounds.
    const bg = catalog.assets['background.village-pub'];
    const response = await fetch(base + '/__ai-assets/scaled-variant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', assetId: bg.id, versionName: bg.activeVersion, sourceFile: bg.versions[bg.activeVersion].file, width: 1920, height: 2160 }),
    });
    expect(response.ok).toBe(true);
    const result = await response.json();
    await page.evaluate(manifest => {
      const scene = (window as any).pointleshDemo.scene;
      scene.aiRuntime.syncManifest(manifest); scene.editing = true; scene.cameras.main.setZoom(2);
    }, result.manifest);
    const room = () => page.evaluate(() => {
      const scene = (window as any).pointleshDemo.scene;
      return { pixels: scene.background.texture.source[0].width,
        bounds: [scene.background.displayWidth, scene.background.displayHeight],
        overlays: scene.overlays.map((overlay: any) => [overlay.image.displayWidth, overlay.image.displayHeight, overlay.image.texture.key]) };
    });
    await expect.poll(async () => (await room()).pixels).toBe(1920);
    expect((await room()).bounds).toEqual([960, 540]);
    expect((await room()).overlays.length).toBeGreaterThan(0);
    for (const overlay of (await room()).overlays) expect(overlay).toEqual([960, 540, 'room.village']);
    await page.evaluate(() => (window as any).pointleshDemo.scene.cameras.main.setZoom(0.25));
    await expect.poll(async () => (await room()).pixels).toBe(960);
    expect((await room()).bounds).toEqual([960, 540]);
    expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); await rm(root, { recursive: true, force: true }); }
});
