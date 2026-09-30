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
export const peekIdleAsset: AiAssetDefinition = {
  ...structuredClone(peekAsset), id: 'borin.peek-idle',
  prompt: 'Continue the exact final Borin peeking pose into eight subtle idle frames: planted feet, gentle breathing, a tiny cautious head shift and blink. Preserve his helmet, beard, clothing, body scale and foot anchor. Transparent background, only Borin.',
  animations: [{ key: 'borin.peek-idle', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 5, repeat: -1 }],
  versions: { stealth: { name: 'stealth', file: 'art/characters/borin/peek-idle.png', model: 'imagegen', createdAt: '2026-09-30T00:00:00.000Z',
    prompt: 'An eight-frame peeking idle loop continuing the final peeking pose with subtle breathing and blinking, fixed feet, proportions and palette, transparent background.',
    notes: 'First frame is the exact last frame of borin.peek. Generated idle poses use one anatomical scale and fixed feet. Full prompt in docs/art-prompts.md.' } },
};
export function addStealthAssets(manifest: AiAssetManifest): void {
  for (const asset of [peekAsset, peekIdleAsset]) {
    manifest.assets[asset.id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[asset.id] ??= ['Graphics', 'Characters'];
  }
  const borin = manifest.assets.borin;
  if (borin) {
    (borin.linkedAnimationAssets ??= {}).peek ??= { assetId: peekAsset.id, label: 'Peek through gate' };
    borin.linkedAnimationAssets['peek-idle'] ??= { assetId: peekIdleAsset.id, label: 'Peeking idle' };
  }
}
export function peekAnimation(idle = false): CharacterAnimations {
  const pose = { assetId: 'borin', key: idle ? 'peek-idle' : 'peek' };
  return { idle: { front: pose, back: pose, right: pose, left: { ...pose, flipX: true } } };
}
export function peekSize(asset?: AiAssetDefinition) {
  return { width: (asset?.dimensions?.width ?? 100) * 1.6, height: asset?.dimensions?.height ?? 140 };
}
