import test from 'node:test';
import assert from 'node:assert/strict';
import { findPath, findClosestReachablePath, clipMovementToWalkable, isSegmentWalkable, pointInPolygon, closestPointOnPolygon, distance } from '../dist/index.js';

const point = (x, y) => ({ x, y });
const box = (x, y, width, height) => [point(x, y), point(x + width, y), point(x + width, y + height), point(x, y + height)];
const pathLength = path => path.slice(1).reduce((total, p, index) => total + distance(path[index], p), 0);

test('routes around the concave corner of an L-shaped floor without crossing the cutout', () => {
  const floor = [point(0, 0), point(100, 0), point(100, 35), point(35, 35), point(35, 100), point(0, 100)];
  const start = point(90, 15), end = point(15, 90);
  const path = findPath(start, end, [floor]);
  assert.deepEqual(path, [start, point(35, 35), end]);
  assert.equal(isSegmentWalkable(start, end, [floor]), false);
  for (let i = 1; i < path.length; i++) assert.equal(isSegmentWalkable(path[i - 1], path[i], [floor]), true);
});

test('finds a shortest route around a solid obstacle and respects narrow walls', () => {
  const floor = box(0, 0, 100, 100), obstacle = box(40, 20, 20, 60);
  const path = findPath(point(10, 50), point(90, 50), [floor], [obstacle]);
  assert.equal(path.length, 4);
  assert.ok(Math.abs(pathLength(path) - (2 * Math.hypot(30, 30) + 20)) < 1e-6);
  assert.equal(isSegmentWalkable(point(10, 50), point(90, 50), [floor], [box(49.999, 0, 0.002, 100)]), false);
});

test('disconnected islands and outside destinations return null, without direct-line fallback', () => {
  const islands = [box(0, 0, 30, 30), box(40, 0, 30, 30)];
  assert.equal(findPath(point(10, 10), point(50, 10), islands), null);
  assert.equal(findPath(point(10, 10), point(80, 10), islands), null);
  assert.equal(findPath(point(-1, 10), point(10, 10), islands), null);
  assert.equal(findPath(point(10, 10), point(10, 10), []), null);
});

test('union of overlapping floors permits routes that cross between polygons', () => {
  const floors = [box(0, 0, 60, 30), box(40, 0, 30, 70), box(40, 50, 60, 30)];
  const path = findPath(point(10, 10), point(90, 70), floors);
  assert.ok(path);
  for (let index = 1; index < path.length; index++) assert.equal(isSegmentWalkable(path[index - 1], path[index], floors), true);
});

test('boundary points are usable and returned paths do not alias document vertices', () => {
  const floor = box(0, 0, 100, 100), start = point(0, 50), end = point(100, 50);
  assert.equal(pointInPolygon(start, floor), true);
  assert.equal(pointInPolygon(start, floor, false), false);
  const path = findPath(start, end, [floor]);
  path[0].x = -500;
  assert.equal(start.x, 0);
  assert.deepEqual(closestPointOnPolygon(point(130, 50), floor), point(100, 50));
});

test('rejects nonfinite and self-intersecting geometry before routing', () => {
  assert.throws(() => findPath(point(NaN, 0), point(10, 10), [box(0, 0, 20, 20)]), /finite/);
  assert.throws(() => findPath(point(1, 1), point(2, 2), [[point(0, 0), point(10, 10), point(0, 10), point(10, 0)]]), /area|intersect/);
});

test('click snapping projects onto a reachable edge without changing exact findPath semantics', () => {
  const floor = box(0, 0, 100, 100), start = point(10, 50), target = point(130, 50);
  assert.equal(findPath(start, target, [floor]), null);
  assert.deepEqual(findClosestReachablePath(start, target, [floor]), [start, point(100, 50)]);
  assert.deepEqual(findClosestReachablePath(start, point(80, 40), [floor]), [start, point(80, 40)]);
  assert.equal(findClosestReachablePath(point(-10, 50), target, [floor]), null);
});

test('snapping chooses the closest reachable component instead of a nearer disconnected island', () => {
  const islands = [box(0, 0, 30, 30), box(40, 0, 30, 30)];
  const path = findClosestReachablePath(point(10, 10), point(60, 10), islands);
  assert.deepEqual(path, [point(10, 10), point(30, 10)]);
  const floor = box(0, 0, 100, 100), wall = box(40, -10, 20, 120);
  const blocked = findClosestReachablePath(point(10, 50), point(130, 50), [floor], [wall]);
  assert.deepEqual(blocked.at(-1), point(40, 50));
});

test('snapping handles inside-obstacle clicks and intersections of overlapping obstacle boundaries', () => {
  const floor = box(0, 0, 100, 100);
  assert.deepEqual(findClosestReachablePath(point(10, 50), point(50, 50), [floor], [box(40, 20, 20, 60)]).at(-1), point(40, 50));
  const obstacles = [box(40, 20, 30, 60), box(60, 30, 30, 40)];
  const path = findClosestReachablePath(point(10, 50), point(65, 50), [floor], obstacles);
  const end = path.at(-1);
  assert.equal(end.x, 70);
  assert.ok(end.y === 30 || end.y === 70);
  for (let index = 1; index < path.length; index++) assert.equal(isSegmentWalkable(path[index - 1], path[index], [floor], obstacles), true);
});

test('direct movement reaches the exact first boundary and never tunnels through a thin wall', () => {
  const floor = box(0, 0, 100, 100);
  assert.deepEqual(clipMovementToWalkable(point(90, 50), point(120, 50), [floor]), point(100, 50));
  assert.deepEqual(clipMovementToWalkable(point(10, 50), point(90, 50), [floor], [box(40, 0, 0.001, 100)]), point(40, 50));
  assert.deepEqual(clipMovementToWalkable(point(100, 50), point(120, 50), [floor]), point(100, 50));
});
