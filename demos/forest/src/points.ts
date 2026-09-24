import { createPointPrefab, createPointleshArea, createPointleshInstance, extendPointleshPrefab, findClosestReachablePath, isPointleshArea, pointleshApproachTarget, resolvePointleshScene, walkablePolygons, type Point, type PointleshPrefabInstance } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { roomNames, targets, type RoomId } from './story';
import { GUARD_HOME_POINT, GUARD_DRINK_POINT } from './guard-patrol';

export const roomEntryPointId = (room: RoomId, from: RoomId) => `${room}.entry.from-${from}`;

/** Add editable room-entry and interaction points without resetting promoted content. */
export function addForestPoints(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source), prefabs = manifest.prefabs ??= {};
  const template = createPointPrefab({ editor: { template: true } });
  prefabs[template.id] ??= template;
  prefabs['forest.point.entry'] ??= extendPointleshPrefab(template, { id: 'forest.point.entry', name: 'Room entry', editor: { folderPath: ['Points'] } });
  prefabs['forest.point.interaction'] ??= extendPointleshPrefab(template, { id: 'forest.point.interaction', name: 'Interaction point', editor: { folderPath: ['Points'] } });
  for (const scene of Object.values(manifest.scenes)) {
    if (scene.id === 'camp' && !scene.layers.some(layer => layer.areas.some(area => area.id === 'camp.cauldron-ground::area'))) {
      scene.layers[0]?.areas.push(createPointleshArea({ id: 'camp.cauldron-ground::area', entityId: 'camp.cauldron-ground', name: 'Cauldron approach',
        walkable: true, closed: true, vertices: [{ id: 'a', x: 210, y: 337 }, { id: 'b', x: 325, y: 337 }, { id: 'c', x: 340, y: 405 }, { id: 'd', x: 210, y: 405 }] }));
    }
    const room = resolvePointleshScene(manifest, scene.id), roomId = scene.id as RoomId;
    if (!targets[roomId]) continue;
    const player = room.objects.find(object => object.properties.role === 'player');
    const floors = walkablePolygons(room);
    const onGround = (position: Point) => player ? findClosestReachablePath(player.position, position, floors)?.at(-1) ?? position : position;
    function add(id: string, name: string, prefabId: string, position: Point, layerId: string) {
      if (scene.layers.some(layer => layer.prefabs?.some(instance => instance.id === id))) return;
      const layer = scene.layers.find(layer => layer.id === layerId)!;
      (layer.prefabs ??= []).push(createPointleshInstance({ id, name, prefabId, overrides: { x: { value: position.x }, y: { value: position.y } } }));
    }
    if (roomId === 'camp') {
      const guard = room.objects.find(object => object.properties.actorName === 'guard');
      if (guard) {
        add(GUARD_HOME_POINT, 'Grub · cage post', 'forest.point.interaction', guard.position, guard.layerId);
        add(GUARD_DRINK_POINT, 'Grub · drink at cauldron', 'forest.point.interaction', onGround({ x: 220, y: 350 }), guard.layerId);
      }
    }
    for (const entity of [...room.areas.filter(area => area.kind === 'hotspot'), ...room.objects.filter(object => object.kind === 'object')]) {
      if (entity.properties.walkPointId) continue;
      const position = onGround(pointleshApproachTarget(room, entity).walkPoint ?? ('position' in entity ? entity.position : { x: 471, y: 465 }));
      const exit = targets[roomId].find(target => target.id === entity.id)?.exit;
      const pointId = exit ? roomEntryPointId(roomId, exit) : `${scene.id}.walk.${entity.id}`;
      add(pointId, exit ? `From ${roomNames[exit]}` : `Walk to ${entity.name}`, exit ? 'forest.point.entry' : 'forest.point.interaction', position, entity.layerId);
      const layer = scene.layers.find(layer => layer.id === entity.layerId)!;
      const area = layer.areas.find(area => isPointleshArea(area) && (area.pointlesh.entityId ?? area.id) === entity.id);
      if (area && isPointleshArea(area)) area.pointlesh.properties.walkPointId = pointId;
      else {
        const instance = layer.prefabs!.find(instance => instance.id === entity.id)! as PointleshPrefabInstance;
        instance.pointlesh ??= {}; instance.pointlesh.properties ??= {}; instance.pointlesh.properties.walkPointId = pointId;
      }
    }
    for (const exit of targets[roomId].filter(target => target.exit)) {
      const area = room.areas.find(area => area.id === exit.id);
      if (!area) continue;
      const position = onGround({ x: Number(area.properties.approachX), y: Number(area.properties.approachY) });
      add(roomEntryPointId(roomId, exit.exit!), `From ${roomNames[exit.exit!]}`, 'forest.point.entry', position, area.layerId);
    }
  }
  return manifest;
}
