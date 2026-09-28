import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { pointInPolygon } from '@pointlesh/core';
const { forestDoors } = await tsImport('../src/door-layout.ts', import.meta.url);
const { addDoorAssets, addForestTransitions } = await tsImport('../src/transition-content.ts', import.meta.url);

test('door sheets preserve the existing aperture, have distinct registered poses, and close in reverse', () => {
  const assets = JSON.parse(readFileSync(new URL('../public/authoring/assets.json', import.meta.url), 'utf8'));
  for (const door of forestDoors) {
    const base = PNG.sync.read(readFileSync(new URL(`../public/art/objects/doors/${door.id}.png`, import.meta.url)));
    const sheet = PNG.sync.read(readFileSync(new URL(`../public/art/objects/doors/${door.id}-open.png`, import.meta.url)));
    assert.equal(sheet.width, base.width * 4); assert.equal(sheet.height, base.height * 2);
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const frame = new PNG({ width: base.width, height: base.height });
      PNG.bitblt(sheet, frame, i % 4 * base.width, Math.floor(i / 4) * base.height, base.width, base.height, 0, 0);
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const inside = pointInPolygon({ x: x + .5, y: y + .5 }, door.aperture);
        assert.equal(frame.data[(y * frame.width + x) * 4 + 3], inside ? 255 : 0, `${door.id}: fully cover the old door, preserve its frame`);
      }
      if (!i) assert.deepEqual(frame.data, base.data);
      frames.push(frame.data.toString('base64'));
    }
    assert.equal(new Set(frames).size, 8, `${door.id}: eight distinct door poses`);
    assert.deepEqual(assets.assets[`door.${door.id}.close`].animations[0].frames, [...assets.assets[`door.${door.id}.open`].animations[0].frames].reverse());
  }
});

test('reapplying transition content preserves edited points, door promotions and the inactive corridors', () => {
  const scenes = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
  const assets = JSON.parse(readFileSync(new URL('../public/authoring/assets.json', import.meta.url), 'utf8'));
  const point = scenes.scenes.village.layers.flatMap(layer => layer.prefabs ?? []).find(point => point.id === 'village.threshold.to-pub');
  point.overrides.x.value = 201;
  assets.assets['door.pub.open'].activeVersion = 'custom';
  assets.assets['door.pub.open'].versions.custom = { name: 'custom', file: 'art/custom.png' };
  const before = structuredClone(assets);
  addDoorAssets(assets); assert.deepEqual(assets, before);
  assert.deepEqual(addForestTransitions(scenes), scenes);
});
