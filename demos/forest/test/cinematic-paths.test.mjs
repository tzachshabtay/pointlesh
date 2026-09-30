import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { isWalkable, isSegmentWalkable, resolvePointleshScene, walkablePolygons } from '@pointlesh/core';
const { forestMarch, cottageDeparture, sampleWalk, walkLength } = await tsImport('../src/cinematic-paths.ts', import.meta.url);
const { scenes: seed } = await tsImport('../src/content.ts', import.meta.url);
const authored = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url)));

for (const [label, manifest] of [['seed', seed], ['authored', authored]]) {
  test(`${label} cinematic feet follow walkable paths through the forest and out of the cottage`, () => {
    const forest = resolvePointleshScene(manifest, 'forest'), departure = cottageDeparture(manifest);
    const village = resolvePointleshScene(manifest, 'village');
    for (const [path, floors] of [[forestMarch(manifest), walkablePolygons(forest)], [departure.path, walkablePolygons({ ...village, areas: departure.areas })]]) {
      assert.ok(path.length >= 2);
      for (let i = 1; i < path.length; i++) assert.ok(isSegmentWalkable(path[i - 1], path[i], floors));
      const length = walkLength(path);
      for (let d = 0; d <= length; d += 3) assert.ok(isWalkable(sampleWalk(path, d), floors));
    }
    assert.deepEqual(departure.path[0], departure.portal.path[1]);
    assert.ok(departure.clearDistance > 0);
  });
}
