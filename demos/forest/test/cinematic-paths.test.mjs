import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { isWalkable, isSegmentWalkable, resolvePointleshScene, walkablePolygons } from '@pointlesh/core';
const { campRescue, forestHomeward, villageHomecoming, forestMarch, villageAbduction, cottageDeparture, sampleWalk, walkLength } = await tsImport('../src/cinematic-paths.ts', import.meta.url);
const { scenes: seed } = await tsImport('../src/content.ts', import.meta.url);
const authored = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url)));

for (const [label, manifest] of [['seed', seed], ['authored', authored]]) {
  test(`${label} cinematic feet follow walkable paths in the village, forest and cottage departure`, () => {
    const forest = resolvePointleshScene(manifest, 'forest'), departure = cottageDeparture(manifest);
    const village = resolvePointleshScene(manifest, 'village');
    for (const [path, floors] of [...Object.values(villageAbduction(manifest)).map(path => [path, walkablePolygons(village)]),
      [forestMarch(manifest), walkablePolygons(forest)], [departure.path, walkablePolygons({ ...village, areas: departure.areas })]]) {
      assert.ok(path.length >= 2);
      assert.ok(walkLength(path) > 5, 'Every approaching actor actually moves');
      for (let i = 1; i < path.length; i++) assert.ok(isSegmentWalkable(path[i - 1], path[i], floors));
      const length = walkLength(path);
      for (let d = 0; d <= length; d += 3) assert.ok(isWalkable(sampleWalk(path, d), floors));
    }
    assert.deepEqual(departure.path[0], departure.portal.path[1]);
    assert.ok(departure.clearDistance > 0);
  });
  test(`${label} village ambush leaves spear clearance and a proper right-orc approach`, () => {
    const paths = villageAbduction(manifest), king = paths.king.at(-1), rear = paths['guard-rear'].at(-1), front = paths['guard-front'].at(-1);
    assert.ok(king.x < 420);
    assert.ok(king.x - rear.x >= 230); assert.ok(front.x - king.x >= 230);
    assert.equal(rear.y, king.y); assert.equal(front.y, king.y);
    assert.ok(walkLength(paths['guard-front']) >= 140);
    assert.ok(walkLength(paths['guard-front']) < 180);
  });
}

for (const [label, manifest] of [['seed', seed], ['authored', authored]]) {
  test(`${label} every ending route stays on the floor, including the cage exit`, () => {
    const camp = resolvePointleshScene(manifest, 'camp'), rescue = campRescue(manifest);
    const campFloors = walkablePolygons({ ...camp, areas: rescue.areas });
    const homeward = forestHomeward(manifest), homecoming = villageHomecoming(manifest);
    const forestFloors = walkablePolygons({ ...resolvePointleshScene(manifest, 'forest'), areas: homeward.areas });
    const villageFloors = walkablePolygons({ ...resolvePointleshScene(manifest, 'village'), areas: homecoming.areas });
    for (const [path, floors] of [
      ...['approach', 'aside', 'release', 'borinEscape', 'kingEscape'].map(key => [rescue[key], campFloors]),
      [homeward.path, forestFloors],
      ...[homecoming.borin, homecoming.king].map(path => [path, villageFloors])]) {
      for (let i = 1; i < path.length; i++) assert.ok(isSegmentWalkable(path[i-1], path[i], floors));
      for (let d = 0; d <= walkLength(path); d += 2) assert.ok(isWalkable(sampleWalk(path, d), floors));
    }
    assert.deepEqual(homeward.path.slice(-homeward.exit.path.length), homeward.exit.path, 'Leave through the village exit, never the trees on the left');
    for (const path of [homecoming.borin, homecoming.king]) {
      let index = -1;
      for (const point of [...homecoming.portal.path].reverse()) {
        index = path.findIndex((candidate, i) => i > index && Math.hypot(candidate.x-point.x, candidate.y-point.y) < 1e-6);
        assert.ok(index >= 0, 'Arrive through every forest entry point in order, never a cottage door');
      }
    }
    assert.deepEqual(rescue.approach.at(-1), rescue.aside[0]);
    assert.deepEqual(rescue.aside.at(-1), rescue.borinEscape[0]);
    assert.deepEqual(rescue.release.at(-1), rescue.kingEscape[0]);
  });
}
