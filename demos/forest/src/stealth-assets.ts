import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import type { CharacterAnimations } from '@pointlesh/core';

export const PEEK_DURATION_MS = 1600;
export const PEEK_DOOR_OPEN = 3 / 8;
export const peekAsset: AiAssetDefinition = {
  id: 'borin.peek', kind: 'animation', dimensions: { width: 640, height: 280 },
  prompt: 'Borin cautiously reaches toward a door and leans right to peek around it. Eight consecutive poses, planted feet, constant body scale, transparent background. Preserve his current helmet, orange beard, green cloak and leather armor. Only Borin; no door or scenery.',
  frameGrid: { frameWidth: 160, frameHeight: 140, columns: 4, rows: 2, frameCount: 8 },
  animations: [{ key: 'borin.peek', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 5, repeat: 0 }],
  settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
  activeVersion: 'stealth', versions: { stealth: { name: 'stealth', file: 'art/characters/borin/peek.png', model: 'imagegen', createdAt: '2026-09-29T00:00:00.000Z',
    prompt: 'The current Borin slowly reaches right and leans to peek through a gate; eight consecutive poses with fixed foot anchors and anatomical scale, transparent background.',
    notes: 'Generated from the promoted Borin base and profile references. Fixed anatomical scale and planted feet. Full prompt in docs/art-prompts.md.' } }, tags: ['forest', 'character', 'stealth'],
};
export function addStealthAssets(manifest: AiAssetManifest): void {
  manifest.assets[peekAsset.id] ??= structuredClone(peekAsset);
  (manifest.assetPaths ??= {})[peekAsset.id] ??= ['Graphics', 'Characters'];
  const borin = manifest.assets.borin;
  if (borin) (borin.linkedAnimationAssets ??= {}).peek ??= { assetId: peekAsset.id, label: 'Peek through gate' };
}
export function peekAnimation(): CharacterAnimations {
  const pose = { assetId: 'borin', key: 'peek' };
  return { idle: { front: pose, back: pose, right: pose, left: { ...pose, flipX: true } } };
}
export function peekSize(asset?: AiAssetDefinition) {
  return { width: (asset?.dimensions?.width ?? 100) * 1.6, height: asset?.dimensions?.height ?? 140 };
}
