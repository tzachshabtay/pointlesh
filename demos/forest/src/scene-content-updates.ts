import type { SceneDesignerManifest } from '@scene-designer/core';
import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import { createObjectPrefab, createPointleshArea, createPointleshInstance, isPointleshArea, resolvePointleshScene } from '@pointlesh/core';
import { items, targets } from './story';

const oldCageDescription = 'The king is imprisoned above a steep ledge. I need a safe way down.';
const oldKingReply = 'East, through the wood. Aldric’s cage is above a ledge in the orc camp. Take a rope, and find a way to open the lock.';
export const kingRescueReply = 'East, through the wood. Aldric is locked in a cage in the orc camp. Take a rope to secure his guard, and find a way to break the lock.';

/** Update only shipped copy; keep custom authoring and old generation provenance intact. */
export function updateRescueAssetText(assets: AiAssetManifest): void {
  const kingLine = assets.assets['line.elder.king'];
  if (kingLine?.voiceSettings?.text === oldKingReply) {
    kingLine.voiceSettings.text = kingRescueReply;
    if (kingLine.prompt === oldKingReply) kingLine.prompt = kingRescueReply;
    // Any previously generated speech describes the old puzzle.
    kingLine.activeVersion = '';
  }
  for (const id of ['inventory.rope', 'inventory.rope.click']) {
    const asset = assets.assets[id];
    if (asset) asset.prompt = asset.prompt.replace('Strong enough to lower a king. Probably.', items.rope.description);
  }
}

export const chestAsset: AiAssetDefinition = {
  id: 'tool-chest', kind: 'image', dimensions: { width: 120, height: 80 },
  prompt: 'A closed dwarven oak tool chest with aged iron bands, lock and three amber runes. Match the Goldroot Mine pixel art; transparent background. Full production prompt in docs/art-prompts.md.',
  activeVersion: 'runed', versions: { runed: { name: 'runed', file: 'art/objects/runed-tool-chest.png',
    prompt: 'Runed dwarven tool chest matching the Goldroot Mine.', model: 'imagegen', createdAt: '2026-09-26T00:00:00.000Z' } },
  tags: ['forest', 'object', 'mine'],
};

export function addForestObjectAssets(assets: AiAssetManifest): void {
  assets.assets[chestAsset.id] ??= structuredClone(chestAsset);
  (assets.assetPaths ??= {})[chestAsset.id] ??= ['Graphics', 'Objects'];
}

/** Upgrade existing authored rooms while retaining unrelated edits and walk points. */
export function updateForestInteractions(source: SceneDesignerManifest): SceneDesignerManifest {
  const manifest = structuredClone(source);
  const updateDescription = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'description' && child === oldCageDescription) {
        (value as Record<string, unknown>)[key] = targets.camp.find(target => target.id === 'cage')!.description;
      } else updateDescription(child);
    }
  };
  updateDescription(manifest);
  const forest = manifest.scenes.forest;
  if (forest) {
    const mushroom = resolvePointleshScene(manifest, 'forest').objects.find(object => object.properties.pickupId === 'mushroom');
    if (mushroom) {
      const layer = forest.layers.find(layer => layer.id === mushroom.layerId)!;
      layer.prefabs = layer.prefabs?.filter(instance => instance.id !== mushroom.id);
      if (!forest.layers.some(layer => layer.areas.some(area => isPointleshArea(area) && area.pointlesh.entityId === 'mushroom'))) {
        layer.areas.push(createPointleshArea({ id: 'mushroom::area', entityId: 'mushroom', kind: 'hotspot', name: 'Dreamcap mushrooms',
          properties: { ...mushroom.properties, role: 'pickup', targetId: 'mushroom', label: 'Dreamcap mushrooms',
            approachX: 181, approachY: 499 }, behaviors: mushroom.behaviors,
          // The violet cluster is painted into the left roots of the wide forest.
          vertices: [[35, 394], [60, 370], [105, 369], [135, 400], [164, 416], [208, 445], [208, 479], [95, 490], [40, 462]]
            .map(([x, y], index) => ({ id: `dreamcap-${index}`, x: x!, y: y! })), closed: true }));
      }
      if (!Object.values(manifest.scenes).some(scene => scene.layers.some(layer => layer.prefabs?.some(instance => instance.prefabId === mushroom.prefabId)))) {
        delete manifest.prefabs![mushroom.prefabId];
      }
    }
  }
  const mine = manifest.scenes.mine;
  if (mine) for (const layer of mine.layers) {
    const chest = layer.areas.find(area => isPointleshArea(area) && area.pointlesh.entityId === 'tool-chest');
    if (!chest || !isPointleshArea(chest)) continue;
    const prefabId = 'forest.object.tool-chest';
    (manifest.prefabs ??= {})[prefabId] ??= createObjectPrefab({ id: prefabId, name: 'Runed tool chest', assetId: chestAsset.id,
      properties: { role: 'prop', targetId: 'tool-chest', description: String(chest.pointlesh.properties.description ?? '') },
      behaviors: ['forest.interact'], editor: { folderPath: ['Objects'] } });
    if (!mine.layers.some(layer => layer.prefabs?.some(instance => instance.id === 'tool-chest'))) {
      const xs = chest.vertices.map(vertex => vertex.x), ys = chest.vertices.map(vertex => vertex.y);
      (layer.prefabs ??= []).push(createPointleshInstance({ id: 'tool-chest', prefabId, name: 'Runed tool chest',
        properties: chest.pointlesh.properties, behaviors: chest.pointlesh.behaviors,
        overrides: { object: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...ys), scaleX: 1, scaleY: 1 } } }));
    }
    layer.areas = layer.areas.filter(area => area !== chest);
  }
  return manifest;
}
