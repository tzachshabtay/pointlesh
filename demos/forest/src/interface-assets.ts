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

const crosshairPrompt = 'The tiny five-pixel yellow sparkle from the inventory click animation, centered on a transparent 16 by 16 canvas. A single pixel with four adjacent one-pixel rays, pale yellow #ffeca4, no outline. Keep it small and precisely centered.';
const crosshairVersion = (file: string, prompt: string) => ({ name: 'original', file, prompt,
  createdAt: '2026-10-03T00:00:00.000Z', model: 'authored-pixel-art', notes: 'Regenerate with demos/forest/scripts/generate-crosshair.mjs. Editable in AI Assets.' });
interfaceAssetDefinitions['cursor.crosshair'] = {
  id: 'cursor.crosshair', kind: 'image', prompt: crosshairPrompt, dimensions: { width: 16, height: 16 },
  activeVersion: 'original', versions: { original: crosshairVersion('art/interface/cursor.crosshair.png', crosshairPrompt) },
  linkedAnimationAssets: { idle: { label: 'Yellow sparkle', assetId: 'cursor.crosshair.idle' } }, tags: ['forest', 'cursor'],
};
interfaceAssetDefinitions['cursor.crosshair.idle'] = {
  id: 'cursor.crosshair.idle', kind: 'animation', prompt: `${crosshairPrompt} Eight-frame seamless loop: gently brighten and dim the yellow glint, with no movement or change in size. Preserve the exact center and silhouette in every frame.`,
  dimensions: { width: 128, height: 16 }, frameGrid: { frameWidth: 16, frameHeight: 16, columns: 8, rows: 1, frameCount: 8 },
  animations: [{ key: 'cursor.crosshair.idle', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 5, repeat: -1 }],
  activeVersion: 'original', versions: { original: crosshairVersion('art/interface/cursor.crosshair.idle.png', 'Eight baked frames of the small yellow glint pulsing.') }, tags: ['forest', 'cursor'],
};
for (const id of ['cursor.crosshair', 'cursor.crosshair.idle']) interfaceAssetPaths[id] = ['Graphics', 'Cursors'];

/** Add the UI catalog without replacing any authored images, animations, or folder edits. */
export function addForestInterfaceAssets(manifest: AiAssetManifest): AiAssetManifest {
  for (const [id, asset] of Object.entries(interfaceAssetDefinitions)) manifest.assets[id] ??= structuredClone(asset);
  for (const [id, path] of Object.entries(interfaceAssetPaths)) (manifest.assetPaths ??= {})[id] ??= [...path];
  return manifest;
}
