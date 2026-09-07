import { isPoint, type Point, type Polygon } from './types.js';

const EPSILON = 1e-7;
export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
const cross = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const interpolate = (a: Point, b: Point, amount: number): Point => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });

export function pointOnSegment(point: Point, a: Point, b: Point): boolean {
  return Math.abs(cross(a, b, point)) <= EPSILON * Math.max(1, distance(a, b)) &&
    point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

/** Polygon edges count as inside unless includeBoundary is false. */
export function pointInPolygon(point: Point, polygon: readonly Point[], includeBoundary = true): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    if (pointOnSegment(point, a, b)) return includeBoundary;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function assertPolygons(polygons: readonly Polygon[]): void {
  for (const polygon of polygons) {
    if (polygon.length < 3 || !polygon.every(isPoint)) throw new Error('Navigation polygons need at least three finite points');
    let twiceArea = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      twiceArea += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(twiceArea) <= EPSILON) throw new Error('Navigation polygons must have nonzero area');
    // Self-intersecting areas have ambiguous fill rules and must be corrected in the designer.
    for (let i = 0; i < polygon.length; i++) {
      for (let j = i + 1; j < polygon.length; j++) {
        if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
        if (intersections(polygon[i]!, polygon[(i + 1) % polygon.length]!, polygon[j]!, polygon[(j + 1) % polygon.length]!).length) {
          throw new Error('Navigation polygons must not self-intersect');
        }
      }
    }
  }
}

/** Returns all intersection points; collinear overlap contributes its endpoints. */
function intersections(a: Point, b: Point, c: Point, d: Point): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y, ex = d.x - c.x, ey = d.y - c.y;
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross(a, b, c)) > EPSILON) return [];
    return [a, b, c, d].filter(point => pointOnSegment(point, a, b) && pointOnSegment(point, c, d));
  }
  const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator;
  const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denominator;
  return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON ? [interpolate(a, b, Math.min(1, Math.max(0, t)))] : [];
}

function edges(polygons: readonly Polygon[]): [Point, Point][] {
  return polygons.flatMap(polygon => polygon.map((point, index): [Point, Point] => [point, polygon[(index + 1) % polygon.length]!]));
}

export function isWalkable(point: Point, walkables: readonly Polygon[], obstacles: readonly Polygon[] = []): boolean {
  return walkables.some(polygon => pointInPolygon(point, polygon)) && !obstacles.some(polygon => pointInPolygon(point, polygon, false));
}

/** Exact interval checks across every polygon boundary avoid corner-cutting and narrow-wall tunneling. */
export function isSegmentWalkable(start: Point, end: Point, walkables: readonly Polygon[], obstacles: readonly Polygon[] = []): boolean {
  if (!isWalkable(start, walkables, obstacles) || !isWalkable(end, walkables, obstacles)) return false;
  const length = distance(start, end);
  if (length <= EPSILON) return true;
  const cuts = [0, 1];
  const dx = end.x - start.x, dy = end.y - start.y;
  for (const [a, b] of edges([...walkables, ...obstacles])) {
    for (const point of intersections(start, end, a, b)) {
      const amount = Math.abs(dx) >= Math.abs(dy) ? (point.x - start.x) / dx : (point.y - start.y) / dy;
      cuts.push(Math.max(0, Math.min(1, amount)));
    }
  }
  cuts.sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i]! - cuts[i - 1]! <= EPSILON) continue;
    if (!isWalkable(interpolate(start, end, (cuts[i]! + cuts[i - 1]!) / 2), walkables, obstacles)) return false;
  }
  return true;
}

/**
 * Shortest visibility-graph path through a union of simple polygons, avoiding obstacle interiors.
 * Includes both endpoints. Returns null for outside or disconnected destinations; never walks through walls.
 * Actor footprint is a point; callers needing clearance should author inset walkables/expanded obstacles.
 */
export function findPath(start: Point, end: Point, walkables: readonly Polygon[], obstacles: readonly Polygon[] = []): Point[] | null {
  if (!isPoint(start) || !isPoint(end)) throw new Error('Path endpoints must be finite points');
  assertPolygons(walkables);
  assertPolygons(obstacles);
  if (!isWalkable(start, walkables, obstacles) || !isWalkable(end, walkables, obstacles)) return null;
  if (distance(start, end) <= EPSILON) return [{ ...start }];
  if (isSegmentWalkable(start, end, walkables, obstacles)) return [{ ...start }, { ...end }];
  const nodes: Point[] = [{ ...start }, { ...end }];
  const add = (point: Point): void => {
    if (isWalkable(point, walkables, obstacles) && !nodes.some(node => distance(node, point) <= EPSILON)) nodes.push({ ...point });
  };
  const all = [...walkables, ...obstacles];
  all.forEach(polygon => polygon.forEach(add));
  const boundaries = edges(all);
  // Intersections are necessary for paths through overlapping walkable regions or clipped obstacles.
  for (let i = 0; i < boundaries.length; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      for (const point of intersections(...boundaries[i]!, ...boundaries[j]!)) add(point);
    }
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current === -1 || costs[i]! < costs[current]!)) current = i;
    if (current === -1 || !Number.isFinite(costs[current])) return null;
    if (current === 1) {
      const path: Point[] = [];
      for (let at = 1; at !== -1; at = previous[at]!) path.unshift({ ...nodes[at]! });
      return path;
    }
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next) || !isSegmentWalkable(nodes[current]!, nodes[next]!, walkables, obstacles)) continue;
      const candidate = costs[current]! + distance(nodes[current]!, nodes[next]!);
      if (candidate < costs[next]!) { costs[next] = candidate; previous[next] = current; }
    }
  }
  return null;
}

export function closestPointOnPolygon(point: Point, polygon: readonly Point[]): Point | null {
  if (!polygon.length) return null;
  if (pointInPolygon(point, polygon)) return { ...point };
  let result: Point | null = null, best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    const amount = squared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
    const candidate = interpolate(a, b, amount), candidateDistance = distance(point, candidate);
    if (candidateDistance < best) { result = candidate; best = candidateDistance; }
  }
  return result;
}
