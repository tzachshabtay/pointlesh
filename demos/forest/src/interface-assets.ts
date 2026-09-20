import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import { items, type ItemId } from './story';

export const inventoryAssetId = (id: ItemId) => `inventory.${id}`;
export const interfaceAssetDefinitions: Record<string, AiAssetDefinition> = {};
export const interfaceAssetPaths: Record<string, string[]> = {};
const subjects = {
  'cursor.walk': 'A pair of small dwarven boot prints, a clear walking cursor',
  'cursor.interact': 'A warm ivory pointing hand with a green cuff, a clear interaction cursor',
  ...Object.fromEntries(Object.entries(items).map(([id, item]) => [inventoryAssetId(id as ItemId), `${item.name}. ${item.description}`])),
};
for (const [id, subject] of Object.entries(subjects)) {
  const prompt = `${subject}. Readable 32 by 32 pixel-art adventure UI icon, transparent background, dark one-pixel outline, warm copper and cream highlights, Bramblehollow forest palette. No text or background.`;
  const version = (file: string, description: string) => ({ name: 'original', file, prompt: description, createdAt: '2026-09-20T00:00:00.000Z', model: 'pointlesh-pixel-art', notes: 'Original pixel art; regenerate with demos/forest/scripts/generate-interface-art.ts. Editable in AI Assets.' });
  interfaceAssetDefinitions[id] = {
    id, kind: 'image', prompt, dimensions: { width: 32, height: 32 }, activeVersion: 'original',
    versions: { original: version(`art/interface/${id}.png`, prompt) },
    linkedAnimationAssets: { click: { label: 'Click', assetId: `${id}.click` } }, tags: ['forest', id.startsWith('cursor.') ? 'cursor' : 'inventory'],
  };
  const click = `${id}.click`;
  interfaceAssetDefinitions[click] = {
    id: click, kind: 'animation', prompt: `${prompt} Six-frame click confirmation: small squash, bounce, then a brief golden glint; return exactly to the base pose. Preserve the item identity and the 32 by 32 canvas in every frame.`,
    dimensions: { width: 192, height: 32 }, frameGrid: { frameWidth: 32, frameHeight: 32, columns: 6, rows: 1, frameCount: 6 },
    animations: [{ key: click, frames: [0, 1, 2, 3, 4, 5], frameRate: 12, repeat: 0 }],
    activeVersion: 'original', versions: { original: version(`art/interface/${click}.png`, `${subject}: click feedback animation.`) }, tags: ['forest', 'click'],
  };
  for (const assetId of [id, click]) interfaceAssetPaths[assetId] = ['Graphics', id.startsWith('cursor.') ? 'Cursors' : 'Inventory'];
}

/** Add the UI catalog without replacing any authored images, animations, or folder edits. */
export function addForestInterfaceAssets(manifest: AiAssetManifest): AiAssetManifest {
  for (const [id, asset] of Object.entries(interfaceAssetDefinitions)) manifest.assets[id] ??= structuredClone(asset);
  for (const [id, path] of Object.entries(interfaceAssetPaths)) (manifest.assetPaths ??= {})[id] ??= [...path];
  return manifest;
}
