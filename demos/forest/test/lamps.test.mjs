import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { resolvePointleshScene } from '@pointlesh/core';
const { assets, scenes } = await tsImport('../src/content.ts', import.meta.url);
const { lampRooms, lampBounds } = await tsImport('../src/lamp-layout.ts', import.meta.url);
const { addLampAssets, addLamps } = await tsImport('../src/lamp-assets.ts', import.meta.url);
const png = async file => PNG.sync.read(await readFile(new URL('../public/art/' + file, import.meta.url)));

test('every lamp is an editable nonblocking object with its own linked animation and light', () => {
  let count = 0;
  for (const [roomId, room] of Object.entries(lampRooms)) for (const lamp of room.lamps) {
    const object = resolvePointleshScene(scenes, roomId).objects.find(object => object.id === `${roomId}.lamp.${lamp.id}`);
    assert.ok(object); count++;
    assert.equal(object.assetId, `lamp.${roomId}.${lamp.id}`);
    assert.equal(object.properties.animationKey, 'burn'); assert.equal(object.properties.animationLoop, true);
    assert.equal(object.properties.lightEnabled, true); assert.equal(object.properties.walkThrough, true); assert.equal(object.properties.interactive, false);
    assert.equal(assets.assets[object.assetId].linkedAnimationAssets.burn.assetId, object.assetId + '.burn');
    assert.deepEqual(assets.assetPaths[object.assetId], ['Graphics', 'Objects', 'Lamps']);
  }
  assert.equal(count, 16);
  const edited = structuredClone(scenes), catalog = structuredClone(assets);
  const lamp = edited.scenes.pub.layers[0].prefabs.find(instance => instance.id === 'pub.lamp.bar');
  lamp.overrides.object.x += 30; lamp.pointlesh = { properties: { lightIntensity: .2 } };
  assert.deepEqual(addLamps(edited), edited);
  catalog.assets['lamp.pub.bar'].linkedAnimationAssets.burn.assetId = 'custom';
  catalog.assets['background.pub'].versions.custom = { ...catalog.assets['background.pub'].versions.lamps, file: 'custom.png' };
  catalog.assets['background.pub'].activeVersion = 'custom';
  const before = structuredClone(catalog); addLampAssets(catalog); assert.deepEqual(catalog, before);
});

test('lamp upgrades preserve previous art versions and custom background promotions', () => {
  for (const room of Object.values(lampRooms)) {
    const catalog = structuredClone(assets), asset = catalog.assets[room.asset];
    asset.versions.previous = { ...asset.versions.lamps, file: `art/${room.source}` }; asset.activeVersion = 'previous'; delete asset.versions.lamps;
    const previous = structuredClone(asset.versions.previous); addLampAssets(catalog);
    assert.equal(asset.versions[asset.activeVersion].file, `art/${room.output}`);
    assert.deepEqual(asset.versions.previous, previous);
  }
});

for (const [roomId, room] of Object.entries(lampRooms)) test(`${roomId} lamp sheets have stable pane masks and preserve every other background pixel`, async () => {
  const original = await png(room.source), clean = await png(room.output), allowed = new Set();
  assert.deepEqual([clean.width, clean.height], [original.width, original.height]);
  for (const lamp of room.lamps) {
    const name = `objects/lamps/${roomId}-${lamp.id}`, sheet = await png(name + '-burn.png'), base = await png(name + '.png');
    const bounds = lampBounds(lamp.panes), { width, height } = bounds;
    assert.deepEqual([sheet.width, sheet.height], [width * 4, height * 2]);
    const panes = new Set();
    for (const [px, py, pw, ph] of lamp.panes) for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
      allowed.add(y * clean.width + x); panes.add((y - bounds.y) * width + x - bounds.x);
    }
    const hashes = new Set(); let originalFrame = false;
    for (let index = 0; index < 8; index++) {
      const frame = new PNG({ width, height }); PNG.bitblt(sheet, frame, index % 4 * width, Math.floor(index / 4) * height, width, height, 0, 0);
      hashes.add(createHash('sha256').update(frame.data).digest('hex'));
      for (let pixel = 0; pixel < width * height; pixel++) if (!panes.has(pixel)) assert.equal(frame.data[pixel * 4 + 3], 0, 'Metal bars stay unobscured');
      if (!lamp.exposed) {
        let matchesOriginal = true;
        for (const pixel of panes) {
          const source = ((bounds.y + Math.floor(pixel / width)) * original.width + bounds.x + pixel % width) * 4;
          for (let channel = 0; channel < 3; channel++) {
            const value = frame.data[pixel * 4 + channel], painted = original.data[source + channel];
            assert.ok(Math.abs(value - painted) <= 35, 'Lanterns preserve the original diffused light instead of importing fire silhouettes');
            if (value !== painted) matchesOriginal = false;
          }
        }
        originalFrame ||= matchesOriginal;
      }
      if (index === 0) assert.deepEqual(base.data, frame.data);
    }
    assert.equal(hashes.size, 8);
    if (!lamp.exposed) assert.ok(originalFrame, 'The brightest lantern frame exactly matches its original painted panes');
  }
  let changed = 0;
  for (let pixel = 0; pixel < clean.width * clean.height; pixel++) {
    const offset = pixel * 4;
    if (!clean.data.subarray(offset, offset + 4).equals(original.data.subarray(offset, offset + 4))) { changed++; assert.ok(allowed.has(pixel), 'Only glass/flame interiors change'); }
  }
  assert.ok(changed > 100);
});
