import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { pointInPolygon, resolvePointleshScene } from '@pointlesh/core';
const { forestDoors, doorWorldAperture } = await tsImport('../src/door-layout.ts', import.meta.url);
const { addDoorAssets, addForestTransitions, forestPortal } = await tsImport('../src/transition-content.ts', import.meta.url);

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

test('doorway paths continue the grounded approach instead of climbing to the arch', () => {
  const scenes = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
  for (const { room, to } of [...forestDoors, { room: 'mine', to: 'forest' }]) {
    const portal = forestPortal(scenes, room, to), [inside, threshold, outside] = portal.path;
    const dx = threshold.x - inside.x, dy = threshold.y - inside.y;
    const ex = outside.x - threshold.x, ey = outside.y - threshold.y;
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-6, `${room} → ${to}: same walk line at the sill`);
    assert.ok(dx * ex + dy * ey > 0, `${room} → ${to}: continue forward`);
    assert.ok(Math.hypot(ex, ey) <= 24.000001, `${room} → ${to}: stay close to the floor`);
    assert.equal(portal.fadeOnLastSegment, true);
    const corridor = resolvePointleshScene(scenes, room).areas.find(area => area.id === portal.areaId);
    assert.equal(corridor.enabled, false);
    for (const point of portal.path) assert.ok(pointInPolygon(point, corridor.polygon));
    assert.ok(Math.min(...corridor.polygon.map(point => point.y)) > 0, 'no corridor into the sky');
  }
  assert.equal(forestPortal(scenes, 'forest', 'village').fadeOnLastSegment, undefined, 'open screen edges still walk fully offscreen');
});

test('legacy rooftop endpoints migrate without resetting authored door, floor, or point edits', () => {
  const scenes = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
  const original = structuredClone(scenes), door = forestDoors[0];
  const layer = scenes.scenes.village.layers[0], aperture = doorWorldAperture(door);
  const outside = layer.prefabs.find(point => point.id === 'village.outside.to-pub');
  outside.overrides.x.value = (Math.min(...aperture.map(p => p.x)) + Math.max(...aperture.map(p => p.x))) / 2;
  outside.overrides.y.value = Math.min(...aperture.map(p => p.y)) - 24;
  const entry = resolvePointleshScene(scenes, 'village').points.find(point => point.id === 'village.entry.from-pub').position;
  const area = layer.areas.find(area => area.id === 'village.transition.to-pub::area');
  area.vertices = area.vertices.map((vertex, i) => ({ ...vertex,
    x: i === 0 || i === 3 ? Math.min(entry.x, outside.overrides.x.value) - 44 : Math.max(entry.x, outside.overrides.x.value) + 44,
    y: i < 2 ? -180 : entry.y + 45 }));
  assert.deepEqual(addForestTransitions(scenes), original);
  outside.overrides.x.value = 155; outside.overrides.y.value = 366;
  assert.deepEqual(addForestTransitions(scenes), scenes, 'an edited endpoint and corridor are preserved');
});
