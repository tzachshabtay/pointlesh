import type { SceneDesignerManifest } from '@scene-designer/core';
import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import { createObjectPrefab, createPointleshArea, createPointleshInstance, isPointleshArea, resolvePointleshScene } from '@pointlesh/core';
import { items, targets } from './story';
import { CAGE_DOOR_ID, CAGE_DOOR_PLACEMENT, CAGE_DOOR_PREFAB } from './rescue-assets';

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
  const camp = manifest.scenes.camp;
  if (camp && !camp.layers.some(layer => layer.prefabs?.some(instance => instance.id === CAGE_DOOR_ID))) {
    const layer = camp.layers.find(layer => layer.areas.some(area => isPointleshArea(area) && area.pointlesh.entityId === 'cage')) ?? camp.layers[0]!;
    const old = layer.areas.find(area => isPointleshArea(area) && area.pointlesh.entityId === 'cage');
    const properties = old && isPointleshArea(old) ? old.pointlesh.properties : {};
    (manifest.prefabs ??= {})[CAGE_DOOR_PREFAB] ??= createObjectPrefab({ id: CAGE_DOOR_PREFAB, name: 'Cage door', assetId: 'cage-door',
      properties: { role: 'cage-door', targetId: 'cage', walkThrough: true, description: targets.camp.find(target => target.id === 'cage')!.description },
      behaviors: ['forest.interact'], editor: { folderPath: ['Objects'] } });
    (layer.prefabs ??= []).push(createPointleshInstance({ id: CAGE_DOOR_ID, prefabId: CAGE_DOOR_PREFAB, name: 'Cage door',
      properties: { ...properties, targetId: 'cage', role: 'cage-door', walkThrough: true }, behaviors: ['forest.interact'],
      overrides: { object: { ...CAGE_DOOR_PLACEMENT, anchorX: .5, anchorY: 0 } } }));
    for (const current of camp.layers) {
      // The extracted leaf now occludes the king. These old hand-traced strips
      // described its bars, not the stationary walls left in the background.
      current.areas = current.areas.filter(area => !isPointleshArea(area)
        || area.pointlesh.entityId !== 'cage' && !/^cage occ/i.test(area.pointlesh.name ?? ''));
      const king = current.prefabs?.find(instance => instance.id === 'camp.npc.king');
      const placement = king?.overrides?.object;
      if (placement && 'x' in placement && 'y' in placement && placement.x === 777 && placement.y === 344) {
        placement.x = 658; placement.y = 332;
      }
    }
    const frames = [
      { id: 'left', name: 'Left post', vertices: [[608, 157], [622, 158], [622, 341], [607, 341]] },
      { id: 'header', name: 'Header', vertices: [[608, 148], [823, 141], [823, 179], [608, 184]] },
      { id: 'wall', name: 'Stationary wall', vertices: [[695, 178], [853, 179], [860, 338], [792, 355], [695, 341]] },
    ];
    for (const frame of frames) layer.areas.push(createPointleshArea({ id: `camp.cage.${frame.id}::area`, entityId: `camp.cage.${frame.id}`,
      name: `Cage frame · ${frame.name}`, walkBehindEnabled: true, baseline: 350, closed: true,
      vertices: frame.vertices.map(([x, y], index) => ({ id: `${frame.id}-${index}`, x: x!, y: y! })) }));
  }
  return manifest;
}
