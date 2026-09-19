import { assertSceneManifest, prefabAttributeId, resolvePrefabNumber, resolveSceneArea, type SceneDesignerManifest } from '@scene-designer/core';
import { isPointleshPrefab, type PointleshPrefabInstance, type PointleshSceneArea } from './prefabs.js';

/** Detach standalone region instances into scene-owned polygons, preserving IDs. */
export function migratePointleshSceneAreas(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source);
  for (const scene of Object.values(manifest.scenes)) for (const layer of scene.layers) {
    const retained = [];
    for (const raw of layer.prefabs ?? []) {
      const instance = raw as PointleshPrefabInstance;
      const prefab = manifest.prefabs?.[instance.prefabId];
      if (!prefab || !isPointleshPrefab(prefab) || ['character', 'object', 'point'].includes(prefab.pointlesh.kind)) { retained.push(raw); continue; }
      const shapes = prefab.attributes.filter(attribute => attribute.kind === 'area' || attribute.kind === 'platform');
      // Composite prefabs remain supported; only standalone region definitions migrate.
      if (shapes.length !== 1 || prefab.attributes.some(attribute => attribute.kind === 'object')) { retained.push(raw); continue; }
      const shape = shapes[0]!;
      const area = resolveSceneArea(manifest, scene.id, prefabAttributeId(instance.id, shape.id)).area;
      if (layer.areas.some(existing => existing.id === area.id)) throw new Error(`Area ID already exists: ${area.id}`);
      const properties = { ...prefab.pointlesh.properties, ...instance.pointlesh?.properties };
      const propertySchema = { ...prefab.pointlesh.propertySchema };
      for (const attribute of prefab.attributes) if (attribute.kind === 'number') {
        properties[attribute.id] = resolvePrefabNumber(manifest, prefab.id, attribute.id, instance);
        propertySchema[attribute.id] = { ...propertySchema[attribute.id], type: 'number', label: attribute.name, min: attribute.number.min, max: attribute.number.max, step: attribute.number.step };
      }
      const { editor: _editor, ...metadata } = prefab.pointlesh;
      const native: PointleshSceneArea = { ...area, visible: instance.visible && area.visible, locked: instance.locked || area.locked,
        pointlesh: { ...metadata, ...instance.pointlesh, name: instance.name ?? prefab.name, entityId: instance.id,
          properties, propertySchema, behaviors: [...new Set([...prefab.pointlesh.behaviors, ...(instance.pointlesh?.behaviors ?? [])])] } };
      layer.areas.push(native);
    }
    if (layer.prefabs) layer.prefabs = retained;
  }
  const referenced = new Set(Object.values(manifest.scenes).flatMap(scene => scene.layers.flatMap(layer => (layer.prefabs ?? []).map(instance => instance.prefabId))));
  for (const [id, prefab] of Object.entries(manifest.prefabs ?? {})) {
    if (isPointleshPrefab(prefab) && !['character', 'object', 'point'].includes(prefab.pointlesh.kind) && !referenced.has(id)) delete manifest.prefabs![id];
  }
  assertSceneManifest(manifest);
  return manifest;
}
