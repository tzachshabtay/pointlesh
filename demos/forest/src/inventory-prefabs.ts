import { createInventoryItemPrefab, pointleshPrefabs } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { inventoryAssetId } from './interface-assets';
import { items, type ItemId } from './story';

export const inventoryPrefabId = (id: ItemId) => `forest.inventory.${id}`;
export function addForestInventoryPrefabs(manifest: SceneDesignerManifest): SceneDesignerManifest {
  const prefabs = manifest.prefabs ??= {};
  prefabs['pointlesh.inventory-item'] ??= pointleshPrefabs()['pointlesh.inventory-item']!;
  for (const [id, item] of Object.entries(items)) {
    prefabs[inventoryPrefabId(id as ItemId)] ??= createInventoryItemPrefab({
      id: inventoryPrefabId(id as ItemId), name: item.name, itemId: id, description: item.description,
      assetId: inventoryAssetId(id as ItemId), crosshairAssetId: 'cursor.crosshair',
      editor: { folderPath: ['Inventory items'] },
    });
  }
  return manifest;
}
