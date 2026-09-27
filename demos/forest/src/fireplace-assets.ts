import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { createObjectPrefab, createPointleshArea, createPointleshInstance, type PointleshPropertySchema } from '@pointlesh/core';

export const FIREPLACE_ID = 'pub.fireplace';
export const FIREPLACE_PREFAB = 'forest.object.fireplace';
export const FIREPLACE_PLACEMENT = { x: 748 * 960 / 1182, y: 316 * 540 / 664, scaleX: 960 / 1182, scaleY: 540 / 664 };
export const COTTAGE_FIREPLACE_ID = 'house.fireplace';
export const COTTAGE_FIREPLACE_PLACEMENT = { x: 844 * 960 / 1182, y: 372 * 540 / 664, scaleX: .72 * 960 / 1182, scaleY: .72 * 540 / 664 };
const fireplaceLight = {
  lightEnabled: true, lightColor: '#ffa34d', lightRadiusX: 132, lightRadiusY: 119,
  lightOffsetX: 0, lightOffsetY: -7, lightIntensity: .8,
  // Relative light output follows the luminous area of each generated flame.
  lightFrameIntensities: [.34, .77, 1, .40, .20, .97, .63, .33],
};
const fireplaceLightSchema: Record<string, PointleshPropertySchema> = {
  lightEnabled: { type: 'boolean', label: 'Firelight' }, lightColor: { type: 'string', label: 'Light color' },
  lightRadiusX: { type: 'number', label: 'Light width radius', min: 1 }, lightRadiusY: { type: 'number', label: 'Light height radius', min: 1 },
  lightOffsetX: { type: 'number', label: 'Light offset X' }, lightOffsetY: { type: 'number', label: 'Light offset Y' },
  lightIntensity: { type: 'number', label: 'Light intensity', min: 0, max: 1, step: .05 },
  lightDepth: { type: 'number', label: 'Light depth', step: .1 },
};
const version = (file: string, prompt: string) => ({ name: 'hearth', file, prompt, model: 'imagegen',
  createdAt: '2026-09-26T00:00:00.000Z', notes: 'Built-in image generation from the Copper Tankard hearth. Fixed 4 × 2 cells, uniform scale, transparent flames. Full prompts in docs/art-prompts.md.' });
export const fireplaceAssetDefinitions: Record<string, AiAssetDefinition> = {
  fireplace: { id: 'fireplace', kind: 'image', dimensions: { width: 80, height: 104 },
    prompt: 'Warm yellow-white and orange pixel-art flames and glowing embers from the Copper Tankard hearth. Transparent background, no masonry. Fixed position and scale.',
    activeVersion: 'hearth', versions: { hearth: version('art/objects/fireplace.png', 'First frame of the Copper Tankard fire loop.') },
    linkedAnimationAssets: { burn: { label: 'Burn · looping fire', assetId: 'fireplace.burn' } }, tags: ['forest', 'object', 'pub'] },
  'fireplace.burn': { id: 'fireplace.burn', kind: 'animation', dimensions: { width: 320, height: 208 },
    prompt: 'Eight successive frames of a gently flickering hearth fire. Vary the tongues of flame and rising sparks, retain the same coal bed, scale and baseline. Seamless loop. Transparent background, no stonework, no scenery.',
    frameGrid: { frameWidth: 80, frameHeight: 104, columns: 4, rows: 2, frameCount: 8 },
    animations: [{ key: 'fireplace.burn', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 8, repeat: -1 }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
    activeVersion: 'hearth', versions: { hearth: version('art/objects/fireplace-burn.png', 'Eight-frame pixel-art hearth fire, fixed cells and alpha extraction; full prompts in docs/art-prompts.md.') },
    tags: ['forest', 'object', 'pub', 'animation'] },
  'background.pub': { id: 'background.pub', kind: 'image', dimensions: { width: 1182, height: 664 },
    prompt: 'The original Copper Tankard with only the static flames removed from the firebox; preserve the stonework, grate, logs, ambient lighting and every other part of the room.',
    activeVersion: 'hearth', versions: { hearth: version('art/pub-unlit.png', 'Copper Tankard clean plate. The original background is unchanged outside a small patch inside the hearth.') },
    tags: ['forest', 'background', 'pub'] },
  'background.house': { id: 'background.house', kind: 'image', dimensions: { width: 1182, height: 664 },
    prompt: 'The original Borin cottage with only the small painted flames and luminous embers under the hanging cooking pot removed. Preserve the pot, chain, grate, stonework, lighting and every other part of the room.',
    activeVersion: 'hearth', versions: { hearth: { ...version('art/house-unlit.png', 'A local clean plate beneath the cottage cooking pot. Every pixel outside the firebox remains original.'),
      notes: 'Built-in image generation from the original cottage hearth. Only the small firebox patch is imported; full prompt in docs/art-prompts.md.' } },
    tags: ['forest', 'background', 'house'] },
};

export function addFireplaceAssets(manifest: AiAssetManifest): void {
  for (const [id, asset] of Object.entries(fireplaceAssetDefinitions)) {
    manifest.assets[id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', id.startsWith('background.') ? 'Backgrounds' : 'Objects'];
  }
}

/** Add the shipped hearths once, preserving subsequent placement and animation edits. */
export function addFireplace(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source), pub = manifest.scenes.pub, house = manifest.scenes.house;
  if (!pub?.layers.length && !house?.layers.length) return manifest;
  (manifest.prefabs ??= {})[FIREPLACE_PREFAB] ??= createObjectPrefab({ id: FIREPLACE_PREFAB,
    name: 'Fireplace', assetId: 'fireplace', animationKey: 'burn', animationLoop: true, walkThrough: true,
    properties: { interactive: false, ignoreScaling: true, role: 'scenery', description: 'A welcoming fire in the Copper Tankard.',
      ...fireplaceLight },
    propertySchema: fireplaceLightSchema,
    editor: { folderPath: ['Objects'] } });
  // Upgrade the first flame-only draft while preserving any authored light settings.
  const definition = manifest.prefabs[FIREPLACE_PREFAB] as ReturnType<typeof createObjectPrefab>;
  for (const [key, value] of Object.entries(fireplaceLight)) definition.pointlesh.properties[key] ??= structuredClone(value);
  for (const [key, schema] of Object.entries(fireplaceLightSchema)) (definition.pointlesh.propertySchema ??= {})[key] ??= structuredClone(schema);
  if (pub?.layers.length && !pub.layers.some(layer => layer.prefabs?.some(instance => instance.id === FIREPLACE_ID))) {
    (pub.layers[0]!.prefabs ??= []).push(createPointleshInstance({ id: FIREPLACE_ID, prefabId: FIREPLACE_PREFAB, name: 'Fireplace',
      overrides: { object: FIREPLACE_PLACEMENT } }));
  }
  if (house?.layers.length) {
    if (!house.layers.some(layer => layer.prefabs?.some(instance => instance.id === COTTAGE_FIREPLACE_ID))) {
      (house.layers[0]!.prefabs ??= []).push(createPointleshInstance({ id: COTTAGE_FIREPLACE_ID, prefabId: FIREPLACE_PREFAB, name: 'Cottage fireplace',
        properties: { description: 'A small cooking fire warms Borin’s cottage.', lightRadiusX: 103, lightRadiusY: 91, lightOffsetY: -12, lightIntensity: .7,
          // Light the pot's walk-behind copy as well as the surrounding hearth.
          lightDepth: 310.1 },
        overrides: { object: COTTAGE_FIREPLACE_PLACEMENT } }));
    }
    const cottageFire = house.layers.flatMap(layer => layer.prefabs ?? []).find(instance => instance.id === COTTAGE_FIREPLACE_ID) as ReturnType<typeof createPointleshInstance>;
    ((cottageFire.pointlesh ??= {}).properties ??= {}).lightDepth ??= 310.1;
    if (!house.layers.some(layer => layer.areas.some(area => area.id === 'house.hearth-kettle::area'))) {
      // Keep the original hanging pot in front of the flames. This is an ordinary
      // editable walk-behind, using the same background pixels as the room.
      house.layers[0]!.areas.push(createPointleshArea({ id: 'house.hearth-kettle::area', entityId: 'house.hearth-kettle',
        name: 'Cooking pot in front of fire', walkBehindEnabled: true, baseline: 310, closed: true,
        vertices: [[837, 300], [848, 300], [859, 304], [863, 313], [869, 314], [870, 321], [866, 325],
          [868, 333], [866, 341], [861, 347], [849, 350], [835, 350], [826, 345], [822, 337], [823, 325],
          [819, 321], [820, 313], [825, 313], [831, 304]]
          .map(([x, y], index) => ({ id: `kettle-${index}`, x: x! * 960 / 1182, y: y! * 540 / 664 })) }));
    }
  }
  return manifest;
}
