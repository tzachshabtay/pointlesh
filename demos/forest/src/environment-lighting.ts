import type Phaser from 'phaser';
import type { SceneDesignerManifest } from '@scene-designer/core';
import type { ResolvedPointleshObject, PointleshPrefabDefinition } from '@pointlesh/core';
import { objectCharacterLight, characterLightDefaults, characterLightSchema, type AdventureLightingEnvironment } from '@pointlesh/phaser/lighting';

// Art direction for the painted rooms: diffuse daylight and window light,
// plus the live, editable lamps/fireplaces collected below.
const environments: Record<string, AdventureLightingEnvironment> = {
  village: { ambientColor: 0xbdc4ad, lights: [{ id: 'daylight', x: 540, y: 95, radius: 1050, z: 420, color: 0xffedbd, intensity: .45 }] },
  forest: { ambientColor: 0xa0b49f, lights: [
    { id: 'clearing', x: 570, y: 130, radius: 760, z: 330, color: 0xf2ffca, intensity: .45 },
    { id: 'canopy', x: 1240, y: 180, radius: 650, z: 270, color: 0xc4e9d5, intensity: .32 },
  ] },
  pub: { ambientColor: 0xb0a397, lights: [{ id: 'window', x: 746, y: 220, radius: 370, z: 150, color: 0xc3ddd1, intensity: .35 }] },
  house: { ambientColor: 0xb4aa98, lights: [{ id: 'window', x: 410, y: 205, radius: 340, z: 140, color: 0xc2dfb1, intensity: .4 }] },
  mine: { ambientColor: 0x879492, lights: [{ id: 'entrance', x: 195, y: 238, radius: 390, z: 145, color: 0xc6e8d8, intensity: .65 }] },
  camp: { ambientColor: 0xa5b6b5, lights: [{ id: 'sky', x: 560, y: 70, radius: 970, z: 370, color: 0xc1dcea, intensity: .35 }] },
};

export function forestLighting(room: string, objects: readonly ResolvedPointleshObject[], spriteFor: (id: string) => Phaser.GameObjects.Sprite | undefined): AdventureLightingEnvironment {
  const environment = environments[room] ?? { ambientColor: 0xffffff, lights: [] };
  return { ambientColor: environment.ambientColor, lights: [...environment.lights, ...objects.flatMap(object => {
    const sprite = spriteFor(object.id), light = sprite && objectCharacterLight(object, sprite);
    return light ? [light] : [];
  })] };
}

/** Add editable opt-outs and light tuning without overwriting authored values. */
export function withForestLighting(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source);
  for (const prefab of Object.values(manifest.prefabs ?? {})) {
    const metadata = (prefab as Partial<PointleshPrefabDefinition>).pointlesh;
    if (!metadata) continue;
    const schema = metadata.propertySchema ??= {};
    if (metadata.kind === 'character') {
      metadata.properties.receiveLighting ??= true;
      schema.receiveLighting ??= { type: 'boolean', label: 'Receive room lighting' };
    }
    if (metadata.properties.lightEnabled !== undefined) {
      for (const [key, value] of Object.entries(characterLightDefaults)) metadata.properties[key] ??= value;
      for (const [key, value] of Object.entries(characterLightSchema)) schema[key] ??= structuredClone(value);
    }
  }
  return manifest;
}
