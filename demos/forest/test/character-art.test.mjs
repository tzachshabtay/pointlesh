import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { assertManifest, topLevelAiAssetIds } from '@ai-game-assets/core';
import { readCharacterAnimations, resolvePointleshScene } from '@pointlesh/core';

const { CHARACTER_IDS, CHARACTER_VIEWS, CHARACTER_ACTIVITY_FRAMES, characterFramePixels } = await tsImport('../src/sprites.ts', import.meta.url);
const { assets: seedAssets, scenes: seedScenes } = await tsImport('../src/content.ts', import.meta.url);
const publicDirectory = new URL('../public/', import.meta.url);
const authoredAssets = JSON.parse(await readFile(new URL('authoring/assets.json', publicDirectory), 'utf8'));
const authoredScenes = JSON.parse(await readFile(new URL('authoring/scenes.json', publicDirectory), 'utf8'));

test('all six authored character images expose nine playable native AI Assets animations backed by PNGs', async () => {
  assertManifest(authoredAssets);
  const animationKeys = new Set();
  let files = 0;
  for (const id of CHARACTER_IDS) {
    const parent = authoredAssets.assets[id];
    assert.equal(parent.kind, 'image');
    assert.equal(parent.frameGrid, undefined);
    assert.equal(parent.animations, undefined);
    assert.ok(parent.dimensions.width > 0 && parent.dimensions.height > 0);
    assert.ok(parent.versions[parent.activeVersion]?.file, `${id} has a promoted or original image`);
    const family = [parent];
    for (const activity of ['idle', 'walk', 'speak']) for (const facing of CHARACTER_VIEWS) {
      const link = parent.linkedAnimationAssets[`${activity}-${facing}`];
      assert.ok(link, `${parent.id} exposes ${activity}-${facing}`);
      const child = authoredAssets.assets[link.assetId];
      assert.equal(child.kind, 'animation');
      const animation = child.animations[0];
      assert.ok(!animationKeys.has(animation.key), 'Native Phaser animation keys must be globally unique');
      animationKeys.add(animation.key);
      assert.ok(animation.frames.length > 1, `${child.id} has multiple animation frames`);
      assert.ok(animation.frameRate > 0);
      assert.equal(animation.repeat, -1);
      assert.ok(animation.frames.every(frame => frame >= 0 && frame < child.frameGrid.frameCount));
      family.push(child);
    }
    for (const asset of family) {
      const file = asset.versions[asset.activeVersion].file;
      const bytes = await readFile(new URL(file, publicDirectory));
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.equal(bytes.readUInt32BE(16), asset.dimensions.width, `${file} width matches native metadata`);
      assert.equal(bytes.readUInt32BE(20), asset.dimensions.height, `${file} height matches native metadata`);
      if (asset.kind === 'animation') {
        const grid = asset.frameGrid;
        assert.ok(grid.frameWidth > 0 && grid.frameHeight > 0);
        assert.equal(grid.columns * grid.frameWidth, asset.dimensions.width);
        assert.equal(grid.rows * grid.frameHeight, asset.dimensions.height);
        assert.ok(grid.frameCount <= grid.columns * grid.rows);
      }
      files++;
    }
  }
  assert.equal(animationKeys.size, 54);
  assert.equal(files, 60);
});

test('seed and authored catalogs group short asset names and resolve every scene reference', () => {
  for (const [assets, scenes] of [[seedAssets, seedScenes], [authoredAssets, authoredScenes]]) {
    assertManifest(assets);
    const topLevel = new Set(topLevelAiAssetIds(assets));
    for (const id of CHARACTER_IDS) {
      assert.ok(topLevel.has(id));
      assert.equal(assets.assets[id].kind, 'image');
      assert.equal(assets.assets[id].frameGrid, undefined);
      assert.deepEqual(assets.assetPaths[id], ['Graphics', 'Characters']);
      for (const link of Object.values(assets.assets[id].linkedAnimationAssets)) {
        assert.equal(topLevel.has(link.assetId), false, 'Animations stay inside the parent selector');
        assert.ok(assets.assets[link.assetId]);
      }
    }
    for (const id of ['coin', 'rope', 'mushroom']) {
      assert.ok(topLevel.has(id));
      assert.deepEqual(assets.assetPaths[id], ['Graphics', 'Objects']);
    }
    assert.equal(Object.keys(assets.assets).some(id => /^(character|object)\./.test(id)), false);
    for (const roomId of Object.keys(scenes.scenes)) for (const object of resolvePointleshScene(scenes, roomId).objects) {
      assert.ok(assets.assets[object.assetId], `Scene object ${object.id} has a valid asset reference`);
      for (const slots of Object.values(readCharacterAnimations(object.properties) ?? {})) for (const assignment of Object.values(slots)) {
        const parent = assets.assets[assignment.assetId];
        assert.ok(parent?.linkedAnimationAssets[assignment.key], `Scene object ${object.id} has a valid animation reference`);
      }
    }
  }
});

test('characters have distinct front/back/profile art and changing walk, idle, and speech poses', () => {
  for (const id of CHARACTER_IDS) {
    const front = characterFramePixels(id, 'front', 0).data;
    assert.notDeepEqual(characterFramePixels(id, 'back', 0).data, front);
    assert.notDeepEqual(characterFramePixels(id, 'left', 0).data, front);
    for (const activity of ['idle', 'walk', 'speak']) for (const facing of CHARACTER_VIEWS) {
      const frames = CHARACTER_ACTIVITY_FRAMES[activity];
      assert.notDeepEqual(characterFramePixels(id, facing, frames[0]).data, characterFramePixels(id, facing, frames[1]).data);
    }
  }
});

test('authored player and NPC prefab slots resolve their own native assets and mirrored right profiles', () => {
  let characters = 0;
  for (const roomId of Object.keys(authoredScenes.scenes)) for (const character of resolvePointleshScene(authoredScenes, roomId).objects.filter(object => object.kind === 'character')) {
    characters++;
    const actorName = character.properties.actorName ?? 'borin';
    const mapping = readCharacterAnimations(character.properties);
    for (const activity of ['idle', 'walk', 'speak']) {
      for (const slot of ['front', 'back', 'left', 'right']) {
        const assignment = mapping[activity][slot];
        assert.equal(assignment.assetId, actorName);
        assert.ok(authoredAssets.assets[assignment.assetId].linkedAnimationAssets[assignment.key]);
      }
      assert.equal(mapping[activity].right.key, mapping[activity].left.key);
      assert.equal(mapping[activity].right.flipX, true);
      assert.equal(mapping[activity].left.flipX, false);
    }
  }
  assert.equal(characters, 11, 'Six room copies of Borin and five NPCs are checked');
});
