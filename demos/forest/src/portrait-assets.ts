import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import { isPointleshPrefab } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';

export const portraitCharacters = {
  borin: 'Borin', king: 'King Aldric', guard: 'Orc guard', elder: 'Elder Rowan', innkeeper: 'Mara', miner: 'Orrin',
} as const;
export const portraitAssets: Record<string, AiAssetDefinition> = {};
for (const [id, name] of Object.entries(portraitCharacters)) {
  const assetId = `portrait.${id}`;
  const prompt = `Close-up pixel-art face portrait of ${name}, matching their current character artwork. Head, face, hair, beard and headgear only, tiny collar edge; no body, hands or props. Crisp detailed pixels, transparent background, fixed head scale and anchor with empty padding around the whole silhouette.`;
  const version = (file: string, prompt: string) => ({ name: 'portrait', file, prompt, model: 'imagegen', createdAt: '2026-10-01T00:00:00.000Z', notes: `Generated from the current ${name} character reference. Full generation prompt in art-source/portraits/${id}.txt. Packed with one scale across the entire loop.` });
  portraitAssets[assetId] = {
    id: assetId, kind: 'image', prompt, dimensions: { width: 256, height: 256 },
    settings: { format: 'png', background: 'transparent' },
    linkedAnimationAssets: { speak: { assetId: `${assetId}.speak`, label: 'Close-up speak' } },
    activeVersion: 'portrait', versions: { portrait: version(`art/portraits/${id}.png`, prompt) }, tags: ['forest', 'portrait', id],
  };
  const speechPrompt = `${prompt} Eight consecutive speaking frames in a 4-column, 2-row sheet. Start with the exact base portrait. Subtle mouth shapes, gentle expression and one blink, seamless loop. Keep the skull, hair, headgear and beard silhouette registered, same head scale in every frame; only the mouth/jaw and eyelids move. Each face stays wholly inside its own square cell. No scenery, text or dividers.`;
  portraitAssets[`${assetId}.speak`] = {
    id: `${assetId}.speak`, kind: 'animation', prompt: speechPrompt, dimensions: { width: 1024, height: 512 },
    frameGrid: { frameWidth: 256, frameHeight: 256, columns: 4, rows: 2, frameCount: 8 },
    animations: [{ key: `${assetId}.speak`, frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 8, repeat: -1 }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
    activeVersion: 'portrait', versions: { portrait: version(`art/portraits/${id}.speak.png`, speechPrompt) }, tags: ['forest', 'portrait', id, 'speak'],
  };
}

/** Catalog upgrades never replace promoted portraits or custom folder assignments. */
export function addPortraitAssets(manifest: AiAssetManifest): void {
  for (const [id, asset] of Object.entries(portraitAssets)) {
    manifest.assets[id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', 'Portraits'];
  }
}
export function addCharacterPortraits(manifest: SceneDesignerManifest): SceneDesignerManifest {
  for (const prefab of Object.values(manifest.prefabs ?? {})) {
    if (!isPointleshPrefab(prefab) || prefab.pointlesh.kind !== 'character') continue;
    const id = prefab.pointlesh.properties.role === 'player' ? 'borin' : prefab.pointlesh.properties.actorName;
    if (typeof id !== 'string' || !(id in portraitCharacters)) continue;
    // Empty is a deliberate "None" selection, so only upgrade absent properties.
    prefab.pointlesh.properties.portraitAssetId ??= `portrait.${id}`;
    prefab.pointlesh.properties.portraitAnimationKey ??= 'speak';
  }
  return manifest;
}
