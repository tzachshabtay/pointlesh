import {
  assertSceneManifest,
  createArea,
  createObject,
  createPrefab,
  createPrefabAreaAttribute,
  createPrefabInstance,
  createPrefabNumberAttribute,
  createPrefabObjectAttribute,
  getScene,
  prefabAttributeId,
  resolvePrefabNumber,
  resolveSceneArea,
  resolveSceneObject,
  type SceneAreaVertex,
  type SceneDesignerManifest,
  type SceneObjectDefaults,
  type ScenePrefabAttribute,
  type ScenePrefabDefinition,
  type ScenePrefabInstance,
  type ScenePrefabNumberDefaults,
} from "@scene-designer/core";
import { assertCharacterAnimations, mergeCharacterAnimations, readCharacterAnimations, type CharacterAnimations } from './animations.js';

/** Only data belongs in a manifest. Register behavior implementations in your game. */
export type PointleshProperty = string | number | boolean | null | PointleshProperty[] | { [key: string]: PointleshProperty };
export type PointleshProperties = Record<string, PointleshProperty>;
export type PointleshPrefabKind = "walkable" | "walk-behind" | "scale" | "zoom" | "hotspot" | "object" | "character";
export type PointleshPropertySchema = {
  label?: string;
  type: "string" | "number" | "boolean" | "json";
  description?: string;
  min?: number;
  max?: number;
  step?: number;
};
export type PointleshPrefabMetadata<P extends PointleshProperties = PointleshProperties> = {
  kind: PointleshPrefabKind;
  properties: P;
  behaviors: string[];
  propertySchema?: Record<string, PointleshPropertySchema>;
};
export type PointleshPrefabDefinition<P extends PointleshProperties = PointleshProperties> = ScenePrefabDefinition & {
  pointlesh: PointleshPrefabMetadata<P>;
};
export type PointleshPrefabInstance = ScenePrefabInstance & {
  pointlesh?: {
    properties?: PointleshProperties;
    /** Extra behavior ids are appended to the prefab's defaults without duplicates. */
    behaviors?: string[];
  };
};
export type PointleshPoint = { x: number; y: number };
export type PointleshPrefabInput = {
  id?: string;
  name?: string;
  properties?: PointleshProperties;
  behaviors?: string[];
  propertySchema?: Record<string, PointleshPropertySchema>;
  /** Additional native scene-designer attributes, including numeric properties. */
  attributes?: ScenePrefabAttribute[];
};
export type PointleshAreaPrefabInput = PointleshPrefabInput & {
  vertices?: Array<PointleshPoint | SceneAreaVertex>;
  closed?: boolean;
};
export type PointleshObjectPrefabInput = PointleshPrefabInput & Partial<SceneObjectDefaults>;

function number(id: string, label: string, value: number, options: Omit<ScenePrefabNumberDefaults, "value"> = {}): ScenePrefabAttribute {
  return createPrefabNumberAttribute({ id, name: label, number: { value, ...options } });
}

function metadata(kind: PointleshPrefabKind, input: PointleshPrefabInput, properties: PointleshProperties): PointleshPrefabMetadata {
  return {
    kind,
    properties: mergeProperties({ enabled: true, ...properties }, input.properties, kind === 'character'),
    behaviors: [...new Set(input.behaviors ?? [])],
    propertySchema: structuredClone(input.propertySchema ?? {}),
  };
}

function mergeAttributes(base: ScenePrefabAttribute[], extension: ScenePrefabAttribute[] = []): ScenePrefabAttribute[] {
  const map = new Map(base.map(attribute => [attribute.id, structuredClone(attribute)]));
  for (const attribute of extension) map.set(attribute.id, structuredClone(attribute));
  return [...map.values()];
}

function areaPrefab(kind: PointleshPrefabKind, name: string, input: PointleshAreaPrefabInput, properties: PointleshProperties, numeric: ScenePrefabAttribute[] = []): PointleshPrefabDefinition {
  const { id: ignored, ...area } = createArea({
    id: "area",
    tag: `pointlesh:${kind}`,
    closed: input.closed ?? true,
    vertices: (input.vertices ?? []).map((vertex, index) => ({ ...vertex, id: "id" in vertex ? vertex.id : `vertex-${index}` })),
  });
  return {
    ...createPrefab({
      id: input.id ?? `pointlesh.${kind}`,
      name: input.name ?? name,
      attributes: mergeAttributes([createPrefabAreaAttribute({ id: "area", name: "Shape", area }), ...numeric], input.attributes),
    }),
    pointlesh: metadata(kind, input, properties),
  };
}

export function createWalkableAreaPrefab(input: PointleshAreaPrefabInput = {}): PointleshPrefabDefinition {
  return areaPrefab("walkable", "Walkable area", input, { walkable: true });
}

export function createWalkBehindAreaPrefab(input: PointleshAreaPrefabInput & { baseline?: number } = {}): PointleshPrefabDefinition {
  return areaPrefab("walk-behind", "Walk-behind area", input, {}, [number("baseline", "Baseline", input.baseline ?? 160, { step: 1 })]);
}

export function createScaleAreaPrefab(input: PointleshAreaPrefabInput & { minScale?: number; maxScale?: number; axis?: "x" | "y" } = {}): PointleshPrefabDefinition {
  return areaPrefab("scale", "Scale area", input, { axis: input.axis ?? "y" }, [
    number("minScale", "Scale at start", input.minScale ?? 0.65, { min: 0.01, step: 0.05, unit: "multiplier" }),
    number("maxScale", "Scale at end", input.maxScale ?? 1, { min: 0.01, step: 0.05, unit: "multiplier" }),
  ]);
}

export function createZoomAreaPrefab(input: PointleshAreaPrefabInput & { minZoom?: number; maxZoom?: number; axis?: "x" | "y"; smoothing?: number } = {}): PointleshPrefabDefinition {
  return areaPrefab("zoom", "Camera zoom area", input, { axis: input.axis ?? "y" }, [
    number("minZoom", "Zoom at start", input.minZoom ?? 1.2, { min: 0.01, step: 0.05, unit: "multiplier" }),
    number("maxZoom", "Zoom at end", input.maxZoom ?? 1, { min: 0.01, step: 0.05, unit: "multiplier" }),
    number("smoothing", "Camera response", input.smoothing ?? 5, { min: 0, step: 0.5 }),
  ]);
}

export function createHotspotPrefab(input: PointleshAreaPrefabInput & { approachX?: number; approachY?: number; approachRadius?: number } = {}): PointleshPrefabDefinition {
  return areaPrefab("hotspot", "Hotspot", input, { label: input.name ?? "Hotspot", cursor: "interact" }, [
    number("approachX", "Approach X", input.approachX ?? 0, { step: 1 }),
    number("approachY", "Approach Y", input.approachY ?? 0, { step: 1 }),
    number("approachRadius", "Approach distance", input.approachRadius ?? 10, { min: 0, step: 1 }),
  ]);
}

function objectPrefab(kind: "object" | "character", input: PointleshObjectPrefabInput, properties: PointleshProperties, numeric: ScenePrefabAttribute[]): PointleshPrefabDefinition {
  const { id: ignored, ...object } = createObject({
    ...input,
    id: "object",
    assetId: input.assetId ?? `pointlesh.${kind}`,
    tag: input.tag ?? `pointlesh:${kind}`,
    anchorX: input.anchorX ?? 0.5,
    // Scene Designer's anchorY measures upward: zero is the sprite's feet.
    anchorY: input.anchorY ?? 0,
  });
  return {
    ...createPrefab({
      id: input.id ?? `pointlesh.${kind}`,
      name: input.name ?? (kind === "character" ? "Character" : "Object"),
      attributes: mergeAttributes([createPrefabObjectAttribute({ id: "object", name: "Sprite", object }), ...numeric], input.attributes),
    }),
    pointlesh: metadata(kind, input, { label: input.name ?? kind, ...properties }),
  };
}

export function createObjectPrefab(input: PointleshObjectPrefabInput = {}): PointleshPrefabDefinition {
  return objectPrefab("object", input, { interactive: true, ignoreScaling: false }, []);
}

export function createCharacterPrefab(input: PointleshObjectPrefabInput & { speed?: number; walkStep?: number; frameDurationMs?: number; frameCount?: number; movementLinkedToAnimation?: boolean; directions?: 4 | 8; animations?: CharacterAnimations } = {}): PointleshPrefabDefinition {
  if (input.animations !== undefined) assertCharacterAnimations(input.animations);
  if (input.directions !== undefined && input.directions !== 4 && input.directions !== 8) throw new Error('Character directions must be 4 or 8');
  return objectPrefab("character", input, {
    interactive: true, ignoreScaling: false,
    movementLinkedToAnimation: input.movementLinkedToAnimation ?? true,
    facing: "down", directions: input.directions ?? 4,
    animations: structuredClone(input.animations ?? {}),
  }, [
    number("speed", "Walking speed", input.speed ?? 70, { min: 1, step: 1, unit: "pixels-per-second" }),
    number("walkStep", "Pixels per animation frame", input.walkStep ?? 7, { min: 0.1, step: 0.5 }),
    number("frameDurationMs", "Frame duration (ms)", input.frameDurationMs ?? 100, { min: 1, step: 5 }),
    number("frameCount", "Walk animation frames", input.frameCount ?? 4, { min: 1, step: 1 }),
  ]);
}

/** Ready-to-register native prefabs. Supply asset ids from your ai-assets manifest. */
export function pointleshPrefabs(options: { objectAssetId?: string; characterAssetId?: string } = {}): Record<string, PointleshPrefabDefinition> {
  const prefabs = [
    createWalkableAreaPrefab(), createWalkBehindAreaPrefab(), createScaleAreaPrefab(), createZoomAreaPrefab(), createHotspotPrefab(),
    createObjectPrefab({ assetId: options.objectAssetId }), createCharacterPrefab({ assetId: options.characterAssetId }),
  ];
  return Object.fromEntries(prefabs.map(prefab => [prefab.id, prefab]));
}

/** Create a reusable derived prefab; instances then inherit the resulting native defaults. */
export function extendPointleshPrefab(base: PointleshPrefabDefinition, extension: PointleshPrefabInput & { id: string }): PointleshPrefabDefinition {
  return {
    ...structuredClone(base),
    id: extension.id,
    name: extension.name ?? base.name,
    attributes: mergeAttributes(base.attributes, extension.attributes),
    pointlesh: {
      kind: base.pointlesh.kind,
      properties: mergeProperties(base.pointlesh.properties, extension.properties, base.pointlesh.kind === 'character'),
      behaviors: [...new Set([...base.pointlesh.behaviors, ...(extension.behaviors ?? [])])],
      propertySchema: { ...structuredClone(base.pointlesh.propertySchema ?? {}), ...structuredClone(extension.propertySchema ?? {}) },
    },
  };
}

export function createPointleshInstance(input: Parameters<typeof createPrefabInstance>[0] & { properties?: PointleshProperties; behaviors?: string[] }): PointleshPrefabInstance {
  const instance: PointleshPrefabInstance = createPrefabInstance(input);
  if (input.properties || input.behaviors) instance.pointlesh = {
    properties: structuredClone(input.properties ?? {}),
    behaviors: [...new Set(input.behaviors ?? [])],
  };
  return instance;
}

export function isPointleshPrefab(prefab: ScenePrefabDefinition): prefab is PointleshPrefabDefinition {
  const data = (prefab as Partial<PointleshPrefabDefinition>).pointlesh;
  return !!data && ["walkable", "walk-behind", "scale", "zoom", "hotspot", "object", "character"].includes(data.kind);
}

function mergeProperties(base: PointleshProperties, overrides: PointleshProperties = {}, character = false): PointleshProperties {
  const properties = { ...structuredClone(base), ...structuredClone(overrides) };
  if (character && (base.animations !== undefined || overrides.animations !== undefined)) properties.animations = mergeCharacterAnimations(readCharacterAnimations(base), readCharacterAnimations(overrides));
  return properties;
}

export type ResolvedPointleshEntity = {
  /** Stable native prefab instance id, suitable for interactions and save files. */
  id: string;
  instanceId: string;
  prefabId: string;
  layerId: string;
  name: string;
  kind: PointleshPrefabKind;
  enabled: boolean;
  properties: PointleshProperties;
  behaviors: string[];
};
export type ResolvedPointleshArea = ResolvedPointleshEntity & {
  areaId: string;
  attributeId: string;
  polygon: PointleshPoint[];
  closed: boolean;
};
export type ResolvedPointleshObject = ResolvedPointleshEntity & {
  objectId: string;
  attributeId: string;
  position: PointleshPoint;
  assetId: string;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
};
export type PointleshResolvedScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  entities: ResolvedPointleshEntity[];
  areas: ResolvedPointleshArea[];
  objects: ResolvedPointleshObject[];
};

/** Preserve designer curves by sampling their quadratic edges for runtime geometry. */
export function pointleshAreaPolygon(vertices: SceneAreaVertex[], closed = true, curveSteps = 12): PointleshPoint[] {
  if (!Number.isInteger(curveSteps) || curveSteps < 1) throw new Error("curveSteps must be a positive integer.");
  const points: PointleshPoint[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const from = vertices[index]!;
    const to = vertices[(index + 1) % vertices.length]!;
    points.push({ x: from.x, y: from.y });
    if (!from.curve || (!closed && index === vertices.length - 1)) continue;
    for (let step = 1; step < curveSteps; step++) {
      const t = step / curveSteps, inv = 1 - t;
      points.push({ x: inv * inv * from.x + 2 * inv * t * from.curve.cx + t * t * to.x, y: inv * inv * from.y + 2 * inv * t * from.curve.cy + t * t * to.y });
    }
  }
  return points;
}

/** Re-run after any designer edit; upstream resolves all native instance overrides. */
export function resolvePointleshScene(manifest: SceneDesignerManifest, sceneId: string): PointleshResolvedScene {
  assertSceneManifest(manifest);
  const scene = getScene(manifest, sceneId);
  const result: PointleshResolvedScene = { id: scene.id, name: scene.name, width: scene.width, height: scene.height, entities: [], areas: [], objects: [] };
  for (const layer of scene.layers) {
    for (const rawInstance of layer.prefabs ?? []) {
      const instance = rawInstance as PointleshPrefabInstance;
      const prefab = manifest.prefabs?.[instance.prefabId];
      if (!prefab || !isPointleshPrefab(prefab)) continue;
      const properties = mergeProperties(prefab.pointlesh.properties, instance.pointlesh?.properties, prefab.pointlesh.kind === 'character');
      for (const attribute of prefab.attributes) {
        if (attribute.kind === "number") properties[attribute.id] = resolvePrefabNumber(manifest, prefab.id, attribute.id, instance);
      }
      const entity: ResolvedPointleshEntity = {
        id: instance.id, instanceId: instance.id, prefabId: prefab.id, layerId: layer.id,
        name: instance.name ?? prefab.name, kind: prefab.pointlesh.kind,
        enabled: layer.visible && instance.visible && properties.enabled !== false,
        properties, behaviors: [...new Set([...prefab.pointlesh.behaviors, ...(instance.pointlesh?.behaviors ?? [])])],
      };
      result.entities.push(entity);
      for (const attribute of prefab.attributes) {
        if (attribute.kind === "area" || attribute.kind === "platform") {
          const area = resolveSceneArea(manifest, scene.id, prefabAttributeId(instance.id, attribute.id))?.area;
          if (area) result.areas.push({ ...entity, enabled: entity.enabled && area.visible, areaId: area.id, attributeId: attribute.id, polygon: pointleshAreaPolygon(area.vertices, area.closed), closed: area.closed });
        } else if (attribute.kind === "object") {
          const object = resolveSceneObject(manifest, scene.id, prefabAttributeId(instance.id, attribute.id))?.object;
          if (object) result.objects.push({ ...entity, enabled: entity.enabled && object.visible, objectId: object.id, attributeId: attribute.id, position: { x: object.x, y: object.y }, assetId: object.assetId, scaleX: object.scaleX, scaleY: object.scaleY, rotation: object.rotation, anchorX: object.anchorX, anchorY: object.anchorY });
        }
      }
    }
  }
  return result;
}

export function walkablePolygons(scene: PointleshResolvedScene): PointleshPoint[][] {
  return scene.areas.filter(area => area.kind === "walkable" && area.enabled && area.closed && area.polygon.length >= 3 && area.properties.walkable !== false).map(area => area.polygon);
}
