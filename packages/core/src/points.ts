import type { CharacterController, ApproachTarget } from './character.js';
import type { Point } from './types.js';
import type { PointleshResolvedScene, ResolvedPointleshEntity, ResolvedPointleshPoint } from './prefabs.js';

/** References are scene-local stable instance IDs, independent of display names. */
export function resolvePointleshPoint(scene: PointleshResolvedScene, pointId: string): ResolvedPointleshPoint {
  const point = scene.points.find(point => point.id === pointId && point.enabled);
  if (!point) throw new Error(`Point "${pointId}" is missing or disabled in scene "${scene.name}".`);
  return point;
}

export function resolvePointleshWalkPoint(scene: PointleshResolvedScene, entity: Pick<ResolvedPointleshEntity, 'properties'>): Point | undefined {
  const id = entity.properties.walkPointId;
  if (id === undefined || id === null || id === '') return undefined;
  if (typeof id !== 'string') throw new Error('Walk point must be a point ID.');
  return { ...resolvePointleshPoint(scene, id).position };
}

/** Move teleports; walking requires reaching the exact authored coordinate. */
export function actOnPoint(character: CharacterController, point: ResolvedPointleshPoint, action: 'move' | 'walk'): Promise<boolean> {
  if (!point.enabled) return Promise.resolve(false);
  if (action === 'move') { character.place(point.position); return Promise.resolve(true); }
  if (action !== 'walk') throw new Error('Unknown point action.');
  return character.walkTo(point.position, undefined, [], { snap: false });
}

/** Build an interaction approach, giving a named walk point priority over legacy coordinates. */
export function pointleshApproachTarget(scene: PointleshResolvedScene, entity: ResolvedPointleshEntity, position?: Point): ApproachTarget {
  const object = scene.objects.find(object => object.id === entity.id);
  const area = scene.areas.find(area => area.id === entity.id);
  const center = position ?? object?.position ?? (area?.polygon.length ? area.polygon.reduce((sum, point) => ({
    x: sum.x + point.x / area.polygon.length, y: sum.y + point.y / area.polygon.length,
  }), { x: 0, y: 0 }) : undefined);
  if (!center) throw new Error(`Entity "${entity.name}" has no interaction position.`);
  let walkPoint = resolvePointleshWalkPoint(scene, entity);
  const properties = entity.properties;
  if (!walkPoint && object && (typeof properties.approachOffsetX === 'number' || typeof properties.approachOffsetY === 'number')) {
    walkPoint = { x: center.x + Number(properties.approachOffsetX ?? 0), y: center.y + Number(properties.approachOffsetY ?? 0) };
  }
  if (!walkPoint && !object && typeof properties.approachX === 'number' && typeof properties.approachY === 'number') {
    walkPoint = { x: properties.approachX, y: properties.approachY };
  }
  return { position: { ...center }, ...(walkPoint ? { walkPoint } : {}) };
}

/** Await this before dispatching the interaction; false means no interaction should run. */
export function approachPointleshEntity(character: CharacterController, scene: PointleshResolvedScene, entity: ResolvedPointleshEntity, position?: Point): Promise<boolean> {
  return character.approach(pointleshApproachTarget(scene, entity, position), 'walk');
}
