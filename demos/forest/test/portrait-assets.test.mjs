import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';
import { resolvePointleshScene } from '@pointlesh/core';
import { createAiAssetDevServer } from '@ai-game-assets/dev';

const { addPortraitAssets, addCharacterPortraits, portraitCharacters } = await tsImport('../src/portrait-assets.ts', import.meta.url);
const { assets, scenes } = await tsImport('../src/content.ts', import.meta.url);
const directory = new URL('../public/', import.meta.url);
const authored = JSON.parse(await readFile(new URL('authoring/assets.json', directory), 'utf8'));
const authoredScenes = JSON.parse(await readFile(new URL('authoring/scenes.json', directory), 'utf8'));

test('every speaking character has a portrait with a native speech child in both catalogs', async () => {
  for (const manifest of [assets, authored]) {
    assertManifest(manifest);
    const roots = new Set(topLevelAiAssetIds(manifest));
    for (const id of Object.keys(portraitCharacters)) {
      const base = manifest.assets[`portrait.${id}`], clip = manifest.assets[base.linkedAnimationAssets.speak.assetId];
      assert.equal(base.kind, 'image'); assert.equal(base.frameGrid, undefined);
      assert.ok(roots.has(base.id)); assert.ok(!roots.has(clip.id));
      assert.deepEqual(manifest.assetPaths[base.id], ['Graphics', 'Portraits']);
      assert.equal(clip.frameGrid.frameCount, 8); assert.equal(clip.animations[0].repeat, -1);
      // Check production originals; promoted versions are user-owned.
      if (manifest !== assets) continue;
      const sheet = PNG.sync.read(await readFile(new URL(clip.versions[clip.activeVersion].file, directory)));
      const image = PNG.sync.read(await readFile(new URL(base.versions[base.activeVersion].file, directory)));
      assert.equal(sheet.width, clip.dimensions.width); assert.equal(sheet.height, clip.dimensions.height);
      const frames = [];
      for (let i = 0; i < 8; i++) {
        const cell = new PNG({ width: 256, height: 256 });
        PNG.bitblt(sheet, cell, i % 4 * 256, Math.floor(i / 4) * 256, 256, 256, 0, 0);
        frames.push(cell.data);
        let occupied = 0;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          if (cell.data[(y * 256 + x) * 4 + 3] <= 16) continue;
          occupied++;
          assert.ok(x >= 15 && x <= 241 && y >= 15 && y <= 240, `${id} frame ${i} has padding, without clipping into adjacent cells`);
        }
        assert.ok(occupied > 12000, `${id} is a visible close-up, not an empty or tiny frame`);
      }
      assert.deepEqual(image.data, frames[0], 'Still portrait exactly matches the first speaking frame');
      assert.ok(new Set(frames.map(frame => frame.toString('base64'))).size >= 7, `${id} contains distinct generated expressions`);
    }
  }
});

test('portrait defaults resolve through character prefabs in every room', () => {
  for (const manifest of [scenes, authoredScenes]) for (const room of Object.keys(manifest.scenes)) {
    for (const actor of resolvePointleshScene(manifest, room).objects.filter(object => object.kind === 'character')) {
      const id = actor.properties.role === 'player' ? 'borin' : actor.properties.actorName;
      assert.equal(actor.properties.portraitAssetId, `portrait.${id}`);
      assert.equal(actor.properties.portraitAnimationKey, 'speak');
    }
  }
});

test('catalog upgrades preserve promoted art, custom folders, None and custom portrait assignments', () => {
  const manifest = structuredClone(authored), world = structuredClone(authoredScenes);
  manifest.assets['portrait.borin'].prompt = 'My portrait'; manifest.assetPaths['portrait.borin'] = ['Custom'];
  world.prefabs['forest.character.borin'].pointlesh.properties.portraitAssetId = '';
  world.prefabs['forest.character.elder'].pointlesh.properties.portraitAnimationKey = 'custom-speak';
  const beforeAssets = structuredClone(manifest), beforeWorld = structuredClone(world);
  addPortraitAssets(manifest); addCharacterPortraits(world);
  assert.deepEqual(manifest, beforeAssets); assert.deepEqual(world, beforeWorld);
});

test('regenerating close-up speech references the portrait base rather than the full-body character', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pointlesh-portrait-reference-'));
  const manifestPath = path.join(root, 'assets.json'), manifest = structuredClone(authored);
  delete manifest.styleGuide; await writeFile(manifestPath, JSON.stringify(manifest));
  let request;
  const server = createAiAssetDevServer({ manifestPath, assetsDir: fileURLToPath(new URL('art/', directory)), publicPathPrefix: 'art', port: 0,
    provider: { async generate(value) { request = value; return []; } },
  });
  await server.listen(); t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${server.server.address().port}/__ai-assets/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: 'portrait.borin.speak' }),
  });
  assert.equal(response.status, 200, await response.text());
  const base = manifest.assets['portrait.borin'];
  const pixels = await readFile(new URL(base.versions[base.activeVersion].file, directory));
  assert.ok(pixels.equals(request.references[0].image)); assert.equal(request.references[0].role, 'animation-base');
});
