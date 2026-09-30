import { distance, findClosestReachablePath, isWalkable, resolvePointleshScene, walkablePolygons, type Point, type Polygon } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { activatePointleshAreas } from './room-transition';
import { forestPortal } from './transition-content';

export function sampleWalk(path: readonly Point[], travelled: number): Point & { facing: 'up' | 'down' | 'left' | 'right' } {
  let remaining = Math.max(0, travelled);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, length = distance(a, b);
    if (!length) continue;
    if (remaining <= length || i === path.length - 1) {
      const t = Math.min(1, remaining / length), dx = b.x - a.x, dy = b.y - a.y;
      return { x: a.x + dx * t, y: a.y + dy * t, facing: Math.abs(dx) >= Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down' };
    }
    remaining -= length;
  }
  return { ...path[0]!, facing: 'down' };
}
export const walkLength = (path: readonly Point[]) => path.slice(1).reduce((sum, p, i) => sum + distance(path[i]!, p), 0);

function route(start: Point, end: Point, floors: Polygon[]): Point[] {
  // Designer edits can move a point beyond the floor. Project it before routing,
  // rather than letting a cinematic bypass the game's walkable geometry.
  const seed = floors.flat()[0];
  if (!seed) throw new Error('The cinematic needs a walkable area');
  const origin = isWalkable(start, floors) ? start : findClosestReachablePath(seed, start, floors)?.at(-1);
  const path = origin && findClosestReachablePath(origin, end, floors);
  if (!path) throw new Error('The cinematic route has no walkable path');
  return path;
}

export function forestMarch(manifest: SceneDesignerManifest): Point[] {
  const room = resolvePointleshScene(manifest, 'forest');
  return route(forestPortal(manifest, 'forest', 'village').path[0]!, forestPortal(manifest, 'forest', 'camp').path[0]!, walkablePolygons(room));
}

export function villageAbduction(manifest: SceneDesignerManifest) {
  const floors = walkablePolygons(resolvePointleshScene(manifest, 'village'));
  return {
    king: route({ x: 468, y: 427 }, { x: 576, y: 470 }, floors),
    'guard-rear': route({ x: 75, y: 442 }, { x: 456, y: 470 }, floors),
    'guard-front': route({ x: 925, y: 440 }, { x: 696, y: 470 }, floors),
    elder: route({ x: 324, y: 415 }, { x: 267, y: 435 }, floors),
  };
}

export function cottageDeparture(manifest: SceneDesignerManifest) {
  const room = resolvePointleshScene(manifest, 'village'), portal = forestPortal(manifest, 'village', 'house');
  const areas = activatePointleshAreas(room.areas, [portal.areaId]);
  const floors = walkablePolygons({ ...room, areas });
  const elder = room.objects.find(object => object.properties.actorName === 'elder');
  const destination = { x: (elder?.position.x ?? 385) + 90, y: (elder?.position.y ?? 423) + 22 };
  const threshold = portal.path[portal.handoffIndex ?? portal.path.length - 1]!;
  const exit = route(threshold, portal.path[0]!, floors);
  const approach = route(exit.at(-1)!, destination, walkablePolygons(room));
  return { portal, areas, path: [...exit, ...approach.slice(1)], clearDistance: walkLength(exit) };
}
