import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import type { CharacterAnimations } from '@pointlesh/core';

export type IntroAction = 'point-spear' | 'hands-up';
export const INTRO_APPROACH_START_MS = 2000;
export const INTRO_SPEAR_START_MS = 5400;
export const INTRO_HANDS_START_MS = 6050;

function clip(id: string, width: number, height: number, prompt: string): AiAssetDefinition {
  return {
    id, kind: 'animation', prompt, dimensions: { width: width * 4, height: height * 2 },
    frameGrid: { frameWidth: width, frameHeight: height, columns: 4, rows: 2, frameCount: 8 },
    animations: [{ key: id, frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 8, repeat: 0 }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
    activeVersion: 'intro', versions: { intro: { name: 'intro', file: `art/characters/${id.replace('.', '/')}.png`,
      prompt, createdAt: '2026-09-28T00:00:00.000Z', model: 'imagegen',
      notes: 'Generated from the promoted character references. Packed at one anatomical scale with planted feet and transparent margins. Full prompts in docs/art-prompts.md.' } },
    tags: ['forest', 'character', 'intro'],
  };
}

export const introAssetDefinitions: Record<string, AiAssetDefinition> = {
  'guard.point-spear': clip('guard.point-spear', 320, 220,
    'The exact orc guard faces left and lowers his existing spear from upright to a horizontal threat, holding it with both hands. Eight consecutive frames with planted feet and stable body size. End holding the pose. One spear, no attack/contact, no other characters, ropes, scenery or glow; transparent background.'),
  'king.hands-up': clip('king.hands-up', 100, 140,
    'The exact dwarf king raises both empty hands above his crown in surrender. Eight consecutive frames, fixed body size and planted feet; end holding both palms up. Preserve his crown, beard, red ermine cape and blue-gold tunic. No weapon, rope, scenery or glow; transparent background.'),
};

/** New intro clips remain editable alongside each character's other animations. */
export function addIntroAssets(manifest: AiAssetManifest): void {
  for (const [id, definition] of Object.entries(introAssetDefinitions)) {
    manifest.assets[id] ??= structuredClone(definition);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', 'Characters'];
  }
  for (const [parent, action, label] of [['guard', 'point-spear', 'Point spear'], ['king', 'hands-up', 'Raise hands']] as const) {
    const asset = manifest.assets[parent];
    if (asset) (asset.linkedAnimationAssets ??= {})[action] ??= { assetId: `${parent}.${action}`, label };
  }
}

export function introAnimation(assetId: string, key: IntroAction): CharacterAnimations {
  const assignment = { assetId, key };
  return { idle: { front: assignment, back: assignment, left: assignment,
    right: { ...assignment, flipX: key === 'point-spear' } } };
}

export function introActionSize(asset: AiAssetDefinition | undefined, action: IntroAction): { width: number; height: number } {
  const width = asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 24;
  const height = asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 32;
  return action === 'point-spear' ? { width: width * 320 / 120, height: height * 220 / 200 } : { width, height };
}
