import { interactionTargets, itemInteractionColumn, verbInteractionColumn, type InteractionManifest } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { items, targets, type ItemId } from './story';

/** One-time seed. Authored edits, including deliberately cleared cells, take precedence. */
export function createForestInteractions(scenes: SceneDesignerManifest): InteractionManifest {
  const manifest: InteractionManifest = { schemaVersion: 1, verbs: [{ id: 'interact', label: 'Interact' }, { id: 'look', label: 'Look' }], heroVoiceAssetId: 'voice.borin', cells: {} };
  const rows = interactionTargets(scenes), inventory = rows.filter(row => row.kind === 'inventory-item');
  for (const row of rows) {
    const cells = manifest.cells[row.id] = {} as InteractionManifest['cells'][string];
    const targetId = String(row.properties.targetId ?? row.locations[0]?.entityId ?? ''), target = Object.values(targets).flat().find(target => target.id === targetId);
    const itemId = String(row.properties.itemId ?? '') as ItemId;
    if (row.kind === 'inventory-item') {
      cells['verb:look'] = { kind: 'simple', text: items[itemId]?.description ?? row.name };
      cells['verb:interact'] = { kind: 'code' }; // Select/put away the item.
      for (const item of inventory) {
        const other = String(item.properties.itemId), column = itemInteractionColumn(item.id.slice('prefab:'.length));
        cells[column] = other === itemId ? { kind: 'impossible' }
          : [itemId, other].includes('stout') && [itemId, other].includes('mushroom') ? { kind: 'code' }
          : { kind: 'simple', text: 'An inspired idea. Unfortunately, inspiration is not enough here.' };
      }
    } else if (target && row.properties.interactive !== false) {
      cells[verbInteractionColumn('look')] = { kind: 'simple', text: typeof row.properties.description === 'string' ? row.properties.description : target.description };
      cells[verbInteractionColumn('interact')] = targetId === 'gold'
        ? { kind: 'simple', text: target.description } : { kind: 'code' };
      for (const item of inventory) {
        const id = String(item.properties.itemId), column = itemInteractionColumn(item.id.slice('prefab:'.length));
        const scripted = (id === 'coin' && targetId === 'innkeeper') || (id === 'sleepyStout' && targetId === 'cauldron') ||
          (id === 'rope' && targetId === 'guard') || (id === 'pickaxe' && targetId === 'cage');
        cells[column] = target.exit ? { kind: 'impossible' } : scripted ? { kind: 'code' } : { kind: 'simple', text: 'I cannot see how that would help here.' };
      }
    }
    if (!Object.keys(cells).length) delete manifest.cells[row.id];
  }
  return manifest;
}
