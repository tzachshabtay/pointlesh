import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { createObjectPrefab, createPointleshInstance } from '@pointlesh/core';
import { fireplaceLightSchema } from './fireplace-assets';
import { lampRooms, lampBounds, lampBrightness, torchBrightness } from './lamp-layout';

const version = (file: string, prompt: string) => ({ name: 'lamps', file, prompt, model: 'imagegen', createdAt: '2026-09-27T00:00:00.000Z',
  notes: 'Original painted lantern light with subtle intensity variation, packed over generated dim glass inside fixed pane masks. Only the exposed gate torch uses the generated flame sheet. Prompts and import details in docs/art-prompts.md.' });

export const lampAssetDefinitions: Record<string, AiAssetDefinition> = {};
for (const [roomId, room] of Object.entries(lampRooms)) for (const [index, lamp] of room.lamps.entries()) {
  const id = `lamp.${roomId}.${lamp.id}`, { width, height } = lampBounds(lamp.panes), file = `art/objects/lamps/${roomId}-${lamp.id}`;
  const prompt = `${lamp.name}: ${'exposed' in lamp ? 'a small exposed torch flame' : 'subtle flicker of the original diffuse amber light behind the glass; no open fire, coal bed, sparks or enlarged flames'}. Preserve the original painted detail, scale, metal dividers and baseline. Transparent outside the panes.`;
  lampAssetDefinitions[id] = { id, kind: 'image', prompt, dimensions: { width, height }, activeVersion: 'lamps', versions: { lamps: version(`${file}.png`, prompt) },
    linkedAnimationAssets: { burn: { label: 'Burn · lamp flicker', assetId: `${id}.burn` } }, tags: ['forest', 'object', 'lamp', roomId] };
  lampAssetDefinitions[`${id}.burn`] = { id: `${id}.burn`, kind: 'animation', prompt, dimensions: { width: width * 4, height: height * 2 },
    frameGrid: { frameWidth: width, frameHeight: height, columns: 4, rows: 2, frameCount: 8 },
    animations: [{ key: `${id}.burn`, frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 7 + index % 3, repeat: -1 }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' }, activeVersion: 'lamps', versions: { lamps: version(`${file}-burn.png`, prompt) },
    tags: ['forest', 'object', 'lamp', 'animation', roomId] };
}

export function addLampAssets(manifest: AiAssetManifest): void {
  for (const [id, asset] of Object.entries(lampAssetDefinitions)) {
    manifest.assets[id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', 'Objects', 'Lamps'];
  }
  for (const room of Object.values(lampRooms)) {
    const asset = manifest.assets[room.asset];
    // Only replace the known shipped artwork. Keep custom promotions selected.
    if (asset?.versions[asset.activeVersion ?? '']?.file !== `art/${room.source}`) continue;
    asset.versions.lamps ??= version(`art/${room.output}`, 'Original room with only its static lamp flames removed from the glass panes. All fixtures and other artwork remain unchanged.');
    asset.activeVersion = 'lamps';
  }
}

/** Named, editable light instances; repeated upgrades retain authored settings. */
export function addLamps(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source);
  for (const [roomId, room] of Object.entries(lampRooms)) {
    const scene = manifest.scenes[roomId]; if (!scene?.layers.length) continue;
    room.lamps.forEach((lamp, index) => {
      const assetId = `lamp.${roomId}.${lamp.id}`, prefabId = `forest.object.${assetId}`, id = `${roomId}.lamp.${lamp.id}`;
      const b = lampBounds(lamp.panes), sx = room.worldWidth / room.width, sy = room.worldHeight / room.roomHeight;
      const brightness = 'exposed' in lamp ? torchBrightness : lampBrightness;
      (manifest.prefabs ??= {})[prefabId] ??= createObjectPrefab({ id: prefabId, name: lamp.name, assetId,
        animationKey: 'burn', animationLoop: true, walkThrough: true, editor: { folderPath: ['Objects', 'Lamps'] },
        properties: { interactive: false, ignoreScaling: true, role: 'scenery', description: lamp.name,
          lightEnabled: true, lightColor: '#ffa34d', lightRadiusX: lamp.radius[0], lightRadiusY: lamp.radius[1],
          lightOffsetX: 0, lightOffsetY: -b.height * sy / 2, lightIntensity: 'exposed' in lamp ? .55 : .38,
          lightFrameIntensities: brightness.map((_, frame) => brightness[(frame + index * 3) % 8]!) },
        propertySchema: fireplaceLightSchema });
      if (!scene.layers.some(layer => layer.prefabs?.some(instance => instance.id === id))) {
        (scene.layers[0]!.prefabs ??= []).push(createPointleshInstance({ id, name: lamp.name, prefabId,
          overrides: { object: { x: (b.x + b.width / 2) * sx, y: (b.y + b.height) * sy, scaleX: sx, scaleY: sy } } }));
      }
    });
  }
  return manifest;
}
