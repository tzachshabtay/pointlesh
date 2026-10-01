import { createObjectPrefab, createPointleshArea, createPointleshInstance, findClosestReachablePath, isPointleshArea,
  resolvePointleshScene, pointleshAreaRange, walkablePolygons, type Point, type ResolvedPointleshArea } from '@pointlesh/core';
import type { AiAssetManifest } from '@ai-game-assets/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { targets, type RoomId } from './story';
import { roomEntryPointId } from './points';
import { doorObjectId, doorWorldAperture, forestDoors } from './door-layout';
import type { RoomPortal } from './room-transition';

export const transitionAreaId = (room: RoomId, to: RoomId) => `${room}.transition.to-${to}`;
export const transitionOutsideId = (room: RoomId, to: RoomId) => `${room}.outside.to-${to}`;
export const transitionThresholdId = (room: RoomId, to: RoomId) => `${room}.threshold.to-${to}`;
export const CAGE_APPROACH_AREA = 'camp.cage-approach';

function continueWalkLine(inside: Point, threshold: Point): Point {
  const dx = threshold.x - inside.x, dy = threshold.y - inside.y;
  const length = Math.hypot(dx, dy);
  // Just a few steps into the passage, along the approach line. Doorway depth
  // is not the height of its image: walking up to the arch makes actors levitate.
  return length > 0 ? { x: threshold.x + dx / length * 24, y: threshold.y + dy / length * 24 }
    : { x: threshold.x, y: threshold.y - 24 };
}
const samePoint = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
const rectangle = (left: number, top: number, right: number, bottom: number): Point[] =>
  [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];

/** Only bridge the doorway to the nearest ordinary ground, never the whole approach. */
function doorwayCorridor(ground: Point, outside: Point): Point[] {
  const length = Math.hypot(outside.x - ground.x, outside.y - ground.y);
  const dx = length ? (outside.x - ground.x) / length : 0, dy = length ? (outside.y - ground.y) / length : -1;
  const start = { x: ground.x - dx * 12, y: ground.y - dy * 12 };
  const end = { x: outside.x + dx * 4, y: outside.y + dy * 4 };
  return [{ x: start.x - dy * 10, y: start.y + dx * 10 }, { x: end.x - dy * 10, y: end.y + dx * 10 },
    { x: end.x + dy * 10, y: end.y - dx * 10 }, { x: start.x + dy * 10, y: start.y - dx * 10 }];
}

export function addDoorAssets(manifest: AiAssetManifest): void {
  for (const door of forestDoors) {
    const id = `door.${door.id}`, { width, height } = door.crop;
    const prompt = `The existing ${door.name} opens inward, revealing an empty passage; the frame and masonry stay fixed. Close by reversing the same poses. Full prompt and import registration in docs/art-prompts.md.`;
    const version = (file: string) => ({ name: 'doors', file, prompt, model: 'imagegen', createdAt: '2026-09-28T00:00:00.000Z' });
    manifest.assets[id] ??= { id, kind: 'image', prompt, dimensions: { width, height }, activeVersion: 'doors',
      versions: { doors: version(`art/objects/doors/${door.id}.png`) }, tags: ['forest', 'door'],
      linkedAnimationAssets: { open: { assetId: `${id}.open`, label: 'Open' }, close: { assetId: `${id}.close`, label: 'Close' } } };
    for (const key of ['open', 'close']) {
      const frames = [0,1,2,3,4,5,6,7]; if (key === 'close') frames.reverse();
      manifest.assets[`${id}.${key}`] ??= { id: `${id}.${key}`, kind: 'animation', prompt,
        dimensions: { width: width * 4, height: height * 2 }, frameGrid: { frameWidth: width, frameHeight: height, columns: 4, rows: 2, frameCount: 8 },
        animations: [{ key: `${id}.${key}`, frames, frameRate: 8, repeat: 0 }], settings: { format: 'png', frameAlignment: 'none', background: 'transparent' },
        activeVersion: 'doors', versions: { doors: version(`art/objects/doors/${door.id}-open.png`) }, tags: ['forest', 'door'] };
    }
    for (const key of [id, `${id}.open`, `${id}.close`]) (manifest.assetPaths ??= {})[key] ??= ['Graphics', 'Objects', 'Doors'];
  }
}

/** Copy initial perspective, never retain a live link to another area. */
function initialPerspective(area: ResolvedPointleshArea | undefined, polygon: Point[]) {
  const p = area?.properties ?? {};
  const axis = (effect: 'scale' | 'zoom') => (p[`${effect}Axis`] ?? p.axis) === 'x' ? 'x' as const : 'y' as const;
  const endpoints = (effect: 'scale' | 'zoom', start: number, end: number) => {
    if (!area) return [start, end];
    const range = pointleshAreaRange(area, effect), coordinates = polygon.map(point => point[axis(effect)]);
    // Extend the floor's slope to this shape's OWN edges once. This retains
    // matching values throughout the overlap, without retaining a hidden range.
    const value = (coordinate: number) => Math.max(.01, start + (end - start) *
      (range.end === range.start ? 0 : (coordinate - range.start) / (range.end - range.start)));
    return [value(Math.min(...coordinates)), value(Math.max(...coordinates))];
  };
  const [minScale, maxScale] = endpoints('scale', Number(p.minScale ?? .65), Number(p.maxScale ?? 1));
  const [minZoom, maxZoom] = endpoints('zoom', Number(p.minZoom ?? 1.2), Number(p.maxZoom ?? 1));
  return { minScale: minScale!, maxScale: maxScale!, minZoom: minZoom!, maxZoom: maxZoom!,
    scaleAxis: axis('scale'), zoomAxis: axis('zoom'), smoothing: Number(p.smoothing ?? 5) };
}

/** Add scene-owned corridors and points without moving the user's existing entries. */
export function addForestTransitions(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source);
  for (const scene of Object.values(manifest.scenes)) {
    const roomId = scene.id as RoomId, layer = scene.layers[0];
    if (!targets[roomId] || !layer) continue;
    const room = resolvePointleshScene(manifest, roomId);
    const addPoint = (id: string, name: string, position: Point) => {
      if (scene.layers.some(layer => layer.prefabs?.some(point => point.id === id))) return;
      (layer.prefabs ??= []).push(createPointleshInstance({ id, name, prefabId: 'forest.point.entry', overrides: { x: { value: position.x }, y: { value: position.y } } }));
    };
    for (const target of targets[roomId].filter(target => target.exit)) {
      const to = target.exit!, entry = room.points.find(point => point.id === roomEntryPointId(roomId, to));
      if (!entry) continue;
      const mineGate = roomId === 'forest' && to === 'mine';
      const migrateMineGate = mineGate && samePoint(entry.position, { x: 274, y: 410 });
      const entryPosition = migrateMineGate ? { x: 440, y: 460 } : entry.position;
      if (migrateMineGate) {
        const instance = scene.layers.flatMap(layer => layer.prefabs ?? []).find(point => point.id === entry.id)!;
        instance.overrides = { ...instance.overrides, x: { value: entryPosition.x }, y: { value: entryPosition.y } };
      }
      const door = forestDoors.find(door => door.room === roomId && door.to === to);
      const aperture = door ? doorWorldAperture(door) : undefined;
      const minY = aperture ? Math.min(...aperture.map(p => p.y)) : 0;
      const maxY = aperture ? Math.max(...aperture.map(p => p.y)) : 0;
      const centerX = aperture ? (Math.min(...aperture.map(p => p.x)) + Math.max(...aperture.map(p => p.x))) / 2 : entry.position.x;
      const defaultThreshold = aperture ? { x: centerX, y: maxY + 4 } : roomId === 'village' ? { x: 481, y: 342 } : { x: entry.position.x, y: scene.height + 10 };
      const previousThreshold = room.points.find(point => point.id === transitionThresholdId(roomId, to))?.position;
      // Retire the mine's generated tunnel route; its entrance is the foreground
      // screen edge. Subsequent designer edits to the new points stay intact.
      const migrateMine = roomId === 'mine' && !!previousThreshold && samePoint(previousThreshold, { x: 113.5, y: 271 });
      const threshold = migrateMine ? defaultThreshold : previousThreshold ?? defaultThreshold;
      const spawn = room.objects.find(object => object.properties.role === 'player')?.position ?? entryPosition;
      const inside = findClosestReachablePath(spawn, entryPosition, walkablePolygons(room))?.at(-1) ?? entryPosition;
      const ground = mineGate ? findClosestReachablePath(inside, threshold, walkablePolygons(room))?.at(-1) ?? inside : inside;
      const legacyOutside = { x: centerX, y: minY - 24 };
      const defaultOutside = aperture ? continueWalkLine(ground, threshold) : roomId === 'village' ? { x: 481, y: 247 } : { x: entryPosition.x, y: scene.height + (roomId === 'mine' ? 400 : 230) };
      const previousOutside = room.points.find(point => point.id === transitionOutsideId(roomId, to))?.position;
      const migrateOutside = !!aperture && !!previousOutside && samePoint(previousOutside, legacyOutside);
      const outside = !previousOutside || migrateOutside || migrateMine || migrateMineGate ? defaultOutside : previousOutside;
      addPoint(transitionThresholdId(roomId, to), `Threshold · ${target.name}`, threshold);
      addPoint(transitionOutsideId(roomId, to), `Offscreen / behind doorway · ${target.name}`, outside);
      if (migrateMine) {
        const instance = scene.layers.flatMap(layer => layer.prefabs ?? []).find(point => point.id === transitionThresholdId(roomId, to))!;
        instance.overrides = { ...instance.overrides, x: { value: threshold.x }, y: { value: threshold.y } };
      }
      if (migrateOutside || migrateMine || migrateMineGate) {
        // Upgrade obsolete generated endpoints; preserve other edited points.
        const instance = scene.layers.flatMap(layer => layer.prefabs ?? []).find(point => point.id === transitionOutsideId(roomId, to))!;
        instance.overrides = { ...instance.overrides, x: { value: outside.x }, y: { value: outside.y } };
      }
      const areaId = transitionAreaId(roomId, to);
      const legacyBounds = rectangle(Math.min(entry.position.x, defaultThreshold.x) - 44, aperture || roomId === 'village' ? -180 : Math.min(entry.position.y, defaultThreshold.y) - 45,
        Math.max(entry.position.x, defaultThreshold.x) + 44, aperture || roomId === 'village' ? entry.position.y + 45 : outside.y + 45);
      const route = [entryPosition, inside, threshold, outside];
      const vertices = mineGate ? doorwayCorridor(ground, outside) : aperture || roomId === 'village' ? rectangle(Math.min(...route.map(p => p.x)) - 44, Math.min(...route.map(p => p.y)) - 45,
        Math.max(...route.map(p => p.x)) + 44, Math.max(...route.map(p => p.y)) + 45) : legacyBounds;
      const corridor = scene.layers.flatMap(layer => layer.areas).find(area => isPointleshArea(area) && area.pointlesh.entityId === areaId);
      if (!corridor) {
        layer.areas.push(createPointleshArea({ id: `${areaId}::area`, entityId: areaId, name: `Transition · ${target.name}`,
          closed: true, walkable: true, scaleEnabled: true, zoomEnabled: true, ...initialPerspective(room.areas.find(area => area.id === `${roomId}.floor`), vertices),
          properties: { enabled: false, transitionTo: to },
          vertices }));
      } else if ((migrateMine || migrateMineGate) && isPointleshArea(corridor)) {
        corridor.vertices = vertices.map((point, i) => ({ ...corridor.vertices[i]!, ...point }));
        corridor.pointlesh.properties = { ...corridor.pointlesh.properties, ...initialPerspective(room.areas.find(area => area.id === `${roomId}.floor`), vertices) };
      } else if ((migrateOutside || !aperture && roomId === 'village') && corridor.vertices.length === 4 && corridor.vertices.every((point, i) => samePoint(point, legacyBounds[i]!))) {
        corridor.vertices = vertices.map((point, i) => ({ ...corridor.vertices[i]!, ...point }));
      }
      if (door && aperture) {
        const id = doorObjectId(door), prefabId = `forest.object.door.${door.id}`;
        (manifest.prefabs ??= {})[prefabId] ??= createObjectPrefab({ id: prefabId, name: door.name, assetId: `door.${door.id}`, anchorX: 0, anchorY: 1,
          scaleX: door.scaleX, scaleY: door.scaleY, walkThrough: true, walkPointId: entry.id,
          behaviors: ['forest.interact'],
          properties: { role: 'door', ignoreScaling: true, targetId: target.id, animationKey: 'open', animationPlaying: false, animationLoop: false },
          editor: { folderPath: ['Objects', 'Doors'] } });
        const prefab = manifest.prefabs[prefabId] as ReturnType<typeof createObjectPrefab>;
        prefab.pointlesh.properties.doorAlwaysOpen ??= door.alwaysOpen ?? false;
        (prefab.pointlesh.propertySchema ??= {}).doorAlwaysOpen ??= { type: 'boolean', label: 'Keep door open' };
        if (!scene.layers.some(layer => layer.prefabs?.some(object => object.id === id))) {
          (layer.prefabs ??= []).push(createPointleshInstance({ id, prefabId, name: door.name,
            overrides: { object: { x: door.crop.left * door.scaleX, y: door.crop.top * door.scaleY } } }));
          // The painted door object owns interaction, rather than a second hotspot.
          for (const layer of scene.layers) layer.areas = layer.areas.filter(area => !isPointleshArea(area) || area.pointlesh.entityId !== target.id);
        }
      }
      if (aperture) {
        const maskId = `${door ? doorObjectId(door) : 'mine.entrance'}.frame`;
        const left = Math.min(...aperture.map(p => p.x)), right = Math.max(...aperture.map(p => p.x));
        const inner = [{ x: right, y: maxY + 4 }, ...[...aperture].reverse().slice(1), { x: left, y: maxY + 4 }];
        const legacy = [{ x: left - 180, y: maxY + 4 }, { x: left - 180, y: -250 }, { x: right + 180, y: -250 }, { x: right + 180, y: maxY + 4 }, ...inner];
        // Only the actual jambs and arch occlude actors. A room-sized copy of
        // the static background also covers neighboring animated fireplaces.
        const outerLeft = door ? door.crop.left * door.scaleX : left - 18;
        const outerRight = door ? (door.crop.left + door.crop.width) * door.scaleX : right + 18;
        const outerTop = door ? door.crop.top * door.scaleY : minY - 18;
        const vertices = [{ x: outerLeft, y: maxY + 4 }, { x: outerLeft, y: outerTop }, { x: outerRight, y: outerTop }, { x: outerRight, y: maxY + 4 }, ...inner];
        const mask = scene.layers.flatMap(layer => layer.areas).find(area => area.id === maskId);
        if (!mask && !corridor) {
          layer.areas.push(createPointleshArea({ id: maskId, entityId: maskId, name: `Door frame · ${door?.name ?? 'Mine tunnel entrance'}`, closed: true, walkBehindEnabled: true, baseline: maxY + 5,
            vertices }));
        } else if (mask && mask.vertices.length === legacy.length && mask.vertices.every((p, i) => samePoint(p, legacy[i]!))) {
          mask.vertices = vertices.map((p, i) => ({ ...mask.vertices[i]!, ...p }));
        }
      } else if (roomId === 'village' && !corridor && !layer.areas.some(area => area.id === 'village.forest-canopy')) {
        layer.areas.push(createPointleshArea({ id: 'village.forest-canopy', name: 'Forest path canopy', walkBehindEnabled: true, baseline: 343, closed: true,
          vertices: [{ x: 390, y: -200 }, { x: 570, y: -200 }, { x: 570, y: 295 }, { x: 390, y: 295 }] }));
      }
    }
    if (roomId === 'mine') for (const layer of scene.layers) {
      layer.areas = layer.areas.filter(area => area.id !== 'mine.entrance.frame');
    }
    if (roomId === 'camp' && !layer.areas.some(area => area.id === CAGE_APPROACH_AREA)) {
      const vertices = [{ x: 570, y: 300 }, { x: 740, y: 300 }, { x: 740, y: 448 }, { x: 570, y: 448 }];
      layer.areas.push(createPointleshArea({ id: CAGE_APPROACH_AREA, entityId: CAGE_APPROACH_AREA, name: 'Cage approach · continuous perspective',
        closed: true, walkable: true, scaleEnabled: true, zoomEnabled: true, ...initialPerspective(room.areas.find(area => area.id === 'camp.floor'), vertices), properties: { enabled: false },
        vertices }));
    }
    // Retire both generations of hidden floor-coordinate overrides. Preserve
    // authored endpoint edits; only untouched defaults need slope conversion.
    for (const area of scene.layers.flatMap(layer => layer.areas)) {
      if (!isPointleshArea(area)) continue;
      const p = area.pointlesh.properties;
      const linked = typeof p.perspectiveSourceAreaId === 'string';
      if (!linked && !p.scaleRange && !p.zoomRange) continue;
      const ground = room.areas.find(candidate => candidate.id === (linked ? p.perspectiveSourceAreaId : `${roomId}.floor`));
      const own = resolvePointleshScene(manifest, roomId).areas.find(candidate => candidate.areaId === area.id);
      const initial = initialPerspective(ground, own?.polygon ?? area.vertices);
      for (const effect of ['scale', 'zoom'] as const) {
        const min = effect === 'scale' ? 'minScale' : 'minZoom', max = effect === 'scale' ? 'maxScale' : 'maxZoom';
        if (linked || p[`${effect}Range`] && ground && p[min] === ground.properties[min] && p[max] === ground.properties[max]) {
          p[min] = initial[min]; p[max] = initial[max];
        }
        delete p[`${effect}Range`];
      }
      delete p.perspectiveSourceAreaId;
    }
  }
  return manifest;
}

export function forestPortal(manifest: SceneDesignerManifest, roomId: RoomId, to: RoomId): RoomPortal {
  const room = resolvePointleshScene(manifest, roomId);
  const point = (id: string) => {
    const point = room.points.find(point => point.id === id && point.enabled);
    if (!point) throw new Error(`Missing transition point: ${id}`);
    return point.position;
  };
  const entry = point(roomEntryPointId(roomId, to));
  const spawn = room.objects.find(object => object.properties.role === 'player')?.position ?? entry;
  const inside = findClosestReachablePath(spawn, entry, walkablePolygons(room))?.at(-1) ?? entry;
  const door = forestDoors.find(door => door.room === roomId && door.to === to);
  const threshold = point(transitionThresholdId(roomId, to));
  const approach = roomId === 'forest' && to === 'mine'
    ? findClosestReachablePath(inside, threshold, walkablePolygons(room)) ?? [inside] : [inside];
  const path = [...approach, threshold, point(transitionOutsideId(roomId, to))];
  return { roomId, areaId: transitionAreaId(roomId, to),
    path,
    ...(door ? { handoffIndex: path.length - 2 } : {}),
    ...(door && room.objects.find(object => object.id === doorObjectId(door))?.properties.doorAlwaysOpen !== true
      ? { doorId: doorObjectId(door), doorDurationMs: 900 } : {}) };
}
