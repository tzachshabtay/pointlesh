import { distance, findClosestReachablePath, isWalkable, resolvePointleshScene, walkablePolygons, type Point, type Polygon } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { activatePointleshAreas } from './room-transition';
import { CAGE_DOOR_ID } from './rescue-assets';
import { CAGE_APPROACH_AREA } from './transition-content';
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

/** Continue the entrance street beyond the frame, then join its walkable route. */
export function sampleEntrance(path: readonly Point[], travelled: number) {
  if (travelled >= 0) return sampleWalk(path, travelled);
  const a = path[0]!, b = path.find(point => distance(a, point) > 0) ?? a;
  const length = distance(a, b) || 1;
  return { ...sampleWalk(path, 0), x: a.x + (b.x - a.x) * travelled / length, y: a.y + (b.y - a.y) * travelled / length };
}

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
    // The spear tips extend well beyond the guards' bodies. Leave a clear gap
    // around Aldric, on the broad foreground street instead of the right edge.
    king: route({ x: 468, y: 427 }, { x: 360, y: 500 }, floors),
    'guard-rear': route({ x: 35, y: 494 }, { x: 130, y: 500 }, floors),
    'guard-front': route({ x: 735, y: 500 }, { x: 590, y: 500 }, floors),
  };
}

export function cottageDeparture(manifest: SceneDesignerManifest) {
  const room = resolvePointleshScene(manifest, 'village'), portal = forestPortal(manifest, 'village', 'house');
  const areas = activatePointleshAreas(room.areas, [portal.areaId]);
  const floors = walkablePolygons({ ...room, areas });
  const elder = room.objects.find(object => object.properties.actorName === 'elder');
  const player = room.objects.find(object => object.properties.role === 'player');
  const destination = player?.position ?? { x: 471, y: 462 };
  const threshold = portal.path[portal.handoffIndex ?? portal.path.length - 1]!;
  const exit = route(threshold, portal.path[0]!, floors);
  const approach = route(exit.at(-1)!, destination, walkablePolygons(room));
  return { portal, areas, path: [...exit, ...approach.slice(1)], clearDistance: walkLength(exit),
    elderPosition: elder?.position ?? { x: 387, y: 418 }, playerFacing: player?.properties.facing, elderFacing: elder?.properties.facing };
}

/** Ending choreography uses the same polygons as normal gameplay. */
export function campRescue(manifest: SceneDesignerManifest, origin?: Point) {
  const room = resolvePointleshScene(manifest, 'camp');
  const areas = activatePointleshAreas(room.areas, [CAGE_APPROACH_AREA]);
  const floors = walkablePolygons({ ...room, areas });
  const door = room.objects.find(object => object.id === CAGE_DOOR_ID)!;
  const king = room.objects.find(object => object.properties.actorName === 'king')!;
  const strike = { x: door.position.x + 35, y: door.position.y + 24 };
  const outside = { x: door.position.x + 36, y: door.position.y + 66 };
  const approach = route(origin ?? { x: strike.x - 65, y: strike.y + 45 }, strike, floors);
  const aside = route(approach.at(-1)!, { x: strike.x - 75, y: strike.y + 12 }, floors);
  const release = route(king.position, outside, floors);
  return { areas, approach, aside, release,
    borinEscape: route(aside.at(-1)!, { x: outside.x - 193, y: outside.y + 29 }, floors),
    kingEscape: route(release.at(-1)!, { x: outside.x - 146, y: outside.y + 22 }, floors) };
}
function through(points: readonly Point[], floors: Polygon[]): Point[] {
  let path = route(points[0]!, points[0]!, floors);
  for (const point of points.slice(1)) path = [...path, ...route(path.at(-1)!, point, floors).slice(1)];
  return path;
}
export function forestHomeward(manifest: SceneDesignerManifest) {
  const room = resolvePointleshScene(manifest, 'forest');
  const entry = forestPortal(manifest, 'forest', 'camp'), exit = forestPortal(manifest, 'forest', 'village');
  const areas = activatePointleshAreas(room.areas, [entry.areaId, exit.areaId]);
  const entrance = through(entry.path.slice(0, (entry.handoffIndex ?? entry.path.length - 1) + 1).reverse(),
    walkablePolygons({ ...room, areas: activatePointleshAreas(room.areas, [entry.areaId]) }));
  // Route across ordinary ground first. Activating an exit corridor must not
  // allow the cross-room walk to take a shortcut through scenery.
  const crossing = route(entrance.at(-1)!, exit.path[0]!, walkablePolygons(room));
  const departure = through([crossing.at(-1)!, ...exit.path.slice(1)],
    walkablePolygons({ ...room, areas: activatePointleshAreas(room.areas, [exit.areaId]) }));
  const path = [...entrance, ...crossing.slice(1), ...departure.slice(1)];
  return { path, entry, exit, entryClearDistance: walkLength(entrance), exitStartDistance: walkLength(entrance) + walkLength(crossing), areas };
}
export function villageHomecoming(manifest: SceneDesignerManifest) {
  const room = resolvePointleshScene(manifest, 'village'), portal = forestPortal(manifest, 'village', 'forest');
  const areas = activatePointleshAreas(room.areas, [portal.areaId]);
  const entrance = through([...portal.path].reverse(), walkablePolygons({ ...room, areas }));
  const arrival = (destination: Point) => [...entrance, ...route(entrance.at(-1)!, destination, walkablePolygons(room)).slice(1)];
  return { borin: arrival({ x: 476, y: 435 }), king: arrival({ x: 566, y: 436 }), portal, entryClearDistance: walkLength(entrance), areas };
}
