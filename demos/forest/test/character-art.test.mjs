import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { assertManifest } from '@ai-game-assets/core';
import { readCharacterAnimations, resolvePointleshScene } from '@pointlesh/core';

const { CHARACTER_IDS, CHARACTER_VIEWS, CHARACTER_ACTIVITY_FRAMES, characterFramePixels } = await tsImport('../src/sprites.ts', import.meta.url);
const publicDirectory = new URL('../public/', import.meta.url);
const authoredAssets = JSON.parse(await readFile(new URL('authoring/assets.json', publicDirectory), 'utf8'));
const authoredScenes = JSON.parse(await readFile(new URL('authoring/scenes.json', publicDirectory), 'utf8'));

test('all six authored characters expose nine playable native AI Assets animations backed by PNGs', async () => {
  assertManifest(authoredAssets);
  const animationKeys = new Set();
  let files = 0;
  for (const id of CHARACTER_IDS) {
    const parent = authoredAssets.assets[`character.${id}`];
    assert.equal(parent.kind, 'spritesheet');
    assert.equal(parent.frameGrid.frameCount, 24);
    const family = [parent];
    for (const activity of ['idle', 'walk', 'speak']) for (const facing of CHARACTER_VIEWS) {
      const link = parent.linkedAnimationAssets[`${activity}-${facing}`];
      assert.ok(link, `${parent.id} exposes ${activity}-${facing}`);
      const child = authoredAssets.assets[link.assetId];
      assert.equal(child.kind, 'animation');
      const animation = child.animations[0];
      assert.ok(!animationKeys.has(animation.key), 'Native Phaser animation keys must be globally unique');
      animationKeys.add(animation.key);
      assert.equal(animation.frames.length, CHARACTER_ACTIVITY_FRAMES[activity].length);
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
      assert.equal(asset.frameGrid.frameWidth, 24);
      assert.equal(asset.frameGrid.frameHeight, 32);
      assert.equal(asset.frameGrid.columns * 24, asset.dimensions.width);
      assert.equal(asset.frameGrid.rows * 32, asset.dimensions.height);
      files++;
    }
  }
  assert.equal(animationKeys.size, 54);
  assert.equal(files, 60);
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
        assert.equal(assignment.assetId, `character.${actorName}`);
        assert.ok(authoredAssets.assets[assignment.assetId].linkedAnimationAssets[assignment.key]);
      }
      assert.equal(mapping[activity].right.key, mapping[activity].left.key);
      assert.equal(mapping[activity].right.flipX, true);
      assert.equal(mapping[activity].left.flipX, false);
    }
  }
  assert.equal(characters, 11, 'Six room copies of Borin and five NPCs are checked');
});
