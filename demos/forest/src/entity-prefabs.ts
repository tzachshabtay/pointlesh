import { migratePointleshSceneAreas, extendPointleshPrefab, isPointleshPrefab, type PointleshPrefabDefinition, type PointleshPrefabInstance, type PointleshProperties } from '@pointlesh/core';
import { assertSceneManifest, type SceneDesignerManifest } from '@scene-designer/core';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const placementProperties = new Set(['facing', 'approachX', 'approachY', 'approachOffsetX', 'approachOffsetY']);

/** Move shared identity/settings to named prefabs without changing resolved room content. */
export function specializeForestEntities(input: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(input);
  const prefabs = manifest.prefabs ??= {};
  const groups = new Map<string, { instance: PointleshPrefabInstance; effective: PointleshPrefabDefinition }[]>();
  for (const scene of Object.values(manifest.scenes)) for (const layer of scene.layers) for (const instance of layer.prefabs ?? []) {
    const base = prefabs[instance.prefabId];
    if (!base || !isPointleshPrefab(base) || !['character', 'object'].includes(base.pointlesh.kind)) continue;
    const typed = instance as PointleshPrefabInstance;
    const effective = extendPointleshPrefab(base, { id: base.id, properties: typed.pointlesh?.properties, behaviors: typed.pointlesh?.behaviors });
    const properties = effective.pointlesh.properties;
    const identity = properties.role === 'player' ? 'borin' : properties.actorName ?? properties.pickupId;
    if (typeof identity !== 'string') continue;
    const id = `forest.${base.pointlesh.kind}.${identity}`;
    if (instance.prefabId === id) continue;
    if (prefabs[id]) throw new Error(`Cannot specialize an entity over existing prefab ${id}`);
    for (const attribute of effective.attributes) {
      const override = instance.overrides?.[attribute.id];
      if (override) Object.assign((attribute as any)[attribute.kind], structuredClone(override));
    }
    const entries = groups.get(id) ?? [];
    entries.push({ instance: typed, effective }); groups.set(id, entries);
  }
  for (const [id, entries] of groups) {
    const first = entries[0]!;
    const base = prefabs[first.instance.prefabId] as PointleshPrefabDefinition;
    const prefab = extendPointleshPrefab(base, { id, name: first.instance.name ?? first.effective.name });
    // Only common values become defaults; deliberate room-specific differences remain overrides.
    for (const [key, value] of Object.entries(first.effective.pointlesh.properties)) {
      if (!placementProperties.has(key) && entries.every(entry => equal(entry.effective.pointlesh.properties[key], value))) {
        prefab.pointlesh.properties[key] = structuredClone(value);
      }
    }
    prefab.pointlesh.behaviors = first.effective.pointlesh.behaviors.filter(id => entries.every(entry => entry.effective.pointlesh.behaviors.includes(id)));
    for (const attribute of prefab.attributes) {
      const defaults = (attribute as any)[attribute.kind];
      const sample = (first.effective.attributes.find(candidate => candidate.id === attribute.id) as any)[attribute.kind];
      for (const [key, value] of Object.entries(sample)) {
        if (attribute.kind === 'object' && ['x', 'y'].includes(key)) continue;
        if (entries.every(entry => equal((entry.effective.attributes.find(candidate => candidate.id === attribute.id) as any)[attribute.kind][key], value))) {
          defaults[key] = structuredClone(value);
        }
      }
    }
    prefabs[id] = prefab;
    for (const { instance, effective } of entries) {
      instance.prefabId = id;
      for (const attribute of prefab.attributes) {
        const override = instance.overrides?.[attribute.id];
        if (!override) continue;
        const defaults = (attribute as any)[attribute.kind];
        for (const key of Object.keys(override)) if (equal((override as any)[key], defaults[key])) delete (override as any)[key];
        if (!Object.keys(override).length) delete instance.overrides![attribute.id];
      }
      const properties: PointleshProperties = {};
      for (const [key, value] of Object.entries(effective.pointlesh.properties)) {
        if (!equal(value, prefab.pointlesh.properties[key])) properties[key] = structuredClone(value);
      }
      const behaviors = effective.pointlesh.behaviors.filter(id => !prefab.pointlesh.behaviors.includes(id));
      instance.pointlesh = { ...instance.pointlesh, properties, behaviors };
    }
  }
  const referenced = new Set(Object.values(manifest.scenes).flatMap(scene => scene.layers.flatMap(layer => (layer.prefabs ?? []).map(instance => instance.prefabId))));
  if (!referenced.has('forest.rescue-character')) delete prefabs['forest.rescue-character'];
  for (const prefab of Object.values(prefabs)) if (isPointleshPrefab(prefab) && prefab.id === `pointlesh.${prefab.pointlesh.kind}`) {
    prefab.pointlesh.editor = { ...prefab.pointlesh.editor, template: true };
  }
  assertSceneManifest(manifest);
  return migratePointleshSceneAreas(manifest);
}
