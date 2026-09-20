import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { resolvePointleshScene, resolvePointleshPoint, resolvePointleshWalkPoint, findClosestReachablePath, isWalkable, walkablePolygons } from '@pointlesh/core';
const { scenes } = await tsImport('../src/content.ts', import.meta.url);
const { targets } = await tsImport('../src/story.ts', import.meta.url);
const { addForestPoints, roomEntryPointId } = await tsImport('../src/points.ts', import.meta.url);
const authored = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
for (const [name, manifest] of [['seed', scenes], ['authored', authored]]) test(`${name} room transitions and interactions have editable, reachable named points`, () => {
  for (const [roomId, exits] of Object.entries(targets)) {
    const room = resolvePointleshScene(manifest, roomId);
    for (const exit of exits.filter(exit => exit.exit)) {
      const point = resolvePointleshPoint(room, roomEntryPointId(roomId, exit.exit));
      assert.ok(point.name.startsWith('From '));
      const floors = walkablePolygons(room), spawn = room.objects.find(object => object.properties.role === 'player').position;
      const path = findClosestReachablePath(spawn, point.position, floors);
      assert.ok(path?.length && isWalkable(path.at(-1), floors), `${roomId}/${point.id} has reachable ground`);
      assert.deepEqual(resolvePointleshWalkPoint(room, room.areas.find(area => area.id === exit.id)), point.position);
    }
  }
  const forest = resolvePointleshScene(manifest, 'forest');
  const left = resolvePointleshPoint(forest, roomEntryPointId('forest', 'mine'));
  const right = resolvePointleshPoint(forest, roomEntryPointId('forest', 'camp'));
  assert.ok(right.position.x - left.position.x > 900);
  assert.deepEqual(addForestPoints(manifest), manifest);
});
