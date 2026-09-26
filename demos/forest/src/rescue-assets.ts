import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import type { CharacterAnimations } from '@pointlesh/core';

export const CAGE_DOOR_ID = 'camp.cage-door';
export const CAGE_DOOR_PREFAB = 'forest.object.cage-door';
export const CAGE_DOOR_PLACEMENT = { x: 767 * 960 / 1182, y: 350, scaleX: 960 / 1182, scaleY: 540 / 664 };
export const PICKAXE_START_MS = 1400;
// The door reacts during the raised swing; its first two holds end on the blow.
export const PICKAXE_IMPACT_MS = 640;

const version = (file: string, prompt: string) => ({ name: 'rescue', file, prompt, model: 'imagegen',
  createdAt: '2026-09-26T00:00:00.000Z', notes: 'Generated from the current character/cage reference. Full prompts in docs/art-prompts.md. Imported with fixed anatomical scale and feet/hinge anchors.' });
const animation = (id: string, file: string, width: number, height: number, timings: number[], prompt: string): AiAssetDefinition => {
  const columns = timings.length === 1 ? 1 : 4, rows = Math.ceil(timings.length / columns);
  return { id, kind: 'animation', prompt, dimensions: { width: width * columns, height: height * rows },
    frameGrid: { frameWidth: width, frameHeight: height, columns, rows, frameCount: timings.length },
    animations: [{ key: id, frames: timings.map((_, i) => i), frameRate: 8, repeat: 0, frameTimings: timings.map(delayMs => ({ delayMs })) }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
    activeVersion: 'rescue', versions: { rescue: version(file, prompt) }, tags: ['forest', 'rescue'] };
};
export const rescueAssetDefinitions: Record<string, AiAssetDefinition> = {
  'guard.bound': animation('guard.bound', 'art/characters/guard/bound.png', 240, 200, [1000],
    'The exact sleeping orc from the final collapse frame, head left and boots right, securely tied with painted rope around his torso, arms and ankles. Preserve armor, pose, scale, spear and transparent canvas.'),
  'borin.tie-rope-back': animation('borin.tie-rope-back', 'art/characters/borin/tie-rope-back.png', 200, 200, [200, 220, 300, 300, 300, 300, 220, 300],
    'Borin viewed from behind: kneel, reach forward with rope, wrap, cross ends, pull knot tight, rise. Eight distinct frames, fixed anatomical scale and feet, transparent background. Only Borin and rope.'),
  'borin.pickaxe-back': animation('borin.pickaxe-back', 'art/characters/borin/pickaxe-back.png', 200, 200, [180, 180, 240, 240, 120, 220, 220, 240],
    'The exact Borin viewed from behind slightly right: raise a wooden-handled steel pickaxe, strike a lock ahead at chest height, follow through, lower the weapon. Eight frames, fixed body size and feet; no door or scenery.'),
  'cage-door.open': animation('cage-door.open', 'art/objects/cage-door-open.png', 240, 230, [100, 100, 140, 160, 160, 160, 200, 500],
    'The original narrow wooden barred cage door: padlock shackle breaks and falls, then the door swings outward left around its fixed left hinge. Eight frames. Preserve timber, bars, rails, knots and perspective. Transparent through the bars, no stationary cage or scenery.'),
  'cage-door': { id: 'cage-door', kind: 'image', dimensions: { width: 240, height: 230 },
    prompt: 'The original closed locked wooden cage door extracted from the orc camp; transparent through the bars. Fixed hinge with room to swing left.',
    activeVersion: 'rescue', versions: { rescue: version('art/objects/cage-door.png', 'Closed frame of the original cage door animation; no stationary frame or background.') },
    linkedAnimationAssets: { open: { label: 'Break lock · open door', assetId: 'cage-door.open' } }, tags: ['forest', 'object', 'cage'] },
  'background.camp': { id: 'background.camp', kind: 'image', dimensions: { width: 1182, height: 664 },
    prompt: 'Original orc camp with only the movable door leaf and padlock removed. Keep the stationary cage, all other scenery and lighting unchanged; a dark empty interior behind the door.',
    activeVersion: 'rescue', versions: { rescue: version('art/camp-doorless.png', 'Original camp background with a locally generated clean plate behind the extracted door. Every pixel outside the door patch is unchanged.') },
    tags: ['forest', 'background', 'camp'] },
};
export function addRescueAssets(manifest: AiAssetManifest): void {
  for (const [id, asset] of Object.entries(rescueAssetDefinitions)) {
    manifest.assets[id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[id] ??= id.startsWith('background.') ? ['Graphics', 'Backgrounds']
      : id.startsWith('cage-door') ? ['Graphics', 'Objects'] : ['Graphics', 'Characters'];
  }
  for (const [parent, state, label] of [['borin', 'tie-rope-back', 'Tie rope · back'], ['borin', 'pickaxe-back', 'Pickaxe · back'], ['guard', 'bound', 'Bound · asleep']]) {
    const asset = manifest.assets[parent!];
    if (asset) (asset.linkedAnimationAssets ??= {})[state!] ??= { label: label!, assetId: `${parent}.${state}` };
  }
}
export function rescueAnimation(assetId: string, key: string): CharacterAnimations {
  const assignment = { assetId, key };
  return { idle: { front: assignment, back: assignment, left: assignment, right: assignment } };
}
/** Extra canvas space lets hands/weapons move without shrinking the dwarf. */
export function borinActionSize(asset: AiAssetDefinition | undefined, action: boolean): { width: number; height: number } {
  const width = asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 24;
  const height = asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 32;
  return { width: action ? width * 2 : width, height: action ? height * 200 / 140 : height };
}
