import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';

export const guardAnimationPrompts = {
  'face-back': 'The exact guard from the base image turns smoothly in place from front-facing through a side view to fully back-facing. Eight consecutive frames, stable scale and planted feet; preserve his armor, helmet, spear, palette and proportions. Transparent background; no scenery or shadows.',
  'face-back-left': 'The exact guard from the base image turns in place from fully back-facing to a left-facing profile. Eight consecutive quarter-turn frames that also play smoothly in reverse; stable scale and planted feet. Preserve all equipment and proportions. Transparent background; no scenery or shadows.',
  drink: 'The exact guard from the base image bends toward a cauldron off-canvas to his left, drinks, and straightens. Eight consecutive frames: lean down, bend and gulp, then stand upright. Preserve his gear, scale and planted feet. Do not draw the cauldron, scenery, cast shadows or text; transparent background.',
  collapse: 'The exact guard from the base image becomes drowsy, staggers, drops to his knees and collapses onto his left side. End fully horizontal, head left and boots right, eyes closed, spear on the ground. Preserve costume and anatomical scale. Eight consecutive frames, transparent background, no scenery or labels. A double-width canvas leaves room for the lying body. Full prompt in docs/art-prompts.md.',
};
export const guardAnimationLinks = Object.fromEntries(Object.keys(guardAnimationPrompts).map(key => [key, {
  label: key === 'face-back' ? 'Face · front to back' : key === 'face-back-left' ? 'Face · back to left' : key === 'collapse' ? 'Collapse · asleep' : 'Drink · cauldron', assetId: `guard.${key}`,
}]));
export const guardAnimationDefinitions: Record<string, AiAssetDefinition> = Object.fromEntries(Object.entries(guardAnimationPrompts).map(([key, prompt]) => {
  const id = `guard.${key}`;
  const collapse = key === 'collapse';
  return [id, { id, kind: 'animation', prompt,
    dimensions: collapse ? { width: 960, height: 400 } : { width: 160, height: 160 },
    frameGrid: { frameWidth: collapse ? 240 : 40, frameHeight: collapse ? 200 : 80, columns: 4, rows: 2, frameCount: 8 },
    animations: [{ key: id, frames: collapse ? [1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 8, repeat: 0,
      ...(collapse ? { frameTimings: [250, 180, 200, 180, 150, 150, 500].map(delayMs => ({ delayMs })) } : {}),
      ...(key === 'drink' ? { frameTimings: [125, 180, 250, 700, 700, 700, 180, 200].map(delayMs => ({ delayMs })) } : {}) }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
    activeVersion: 'patrol', versions: { patrol: { name: 'patrol', file: `art/characters/guard/${key}.png`, prompt,
      createdAt: collapse ? '2026-09-26T00:00:00.000Z' : '2026-09-24T00:00:00.000Z', model: 'imagegen',
      notes: collapse ? 'Generated from the current guard reference. 240 × 200 cells, a double-width animation stage, uniform scale and ground baseline; final frame is the sleeping pose. Prompts in docs/art-prompts.md.' : 'Generated from the promoted guard reference. Packed into foot-aligned 40 × 80 cells; prompts in docs/art-prompts.md.' } },
    tags: ['forest', 'character', 'guard', 'patrol', key] } satisfies AiAssetDefinition];
}));

/** The falling body needs a wider stage, not a smaller character squeezed into its standing bounds. */
export function guardAnimationSize(asset: AiAssetDefinition | undefined, collapsed: boolean): { width: number; height: number } {
  return { width: (asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 24) * (collapsed ? 2 : 1),
    height: asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 32 };
}

/** Add new clips without overwriting later edits/promotions or existing guard states. */
export function addGuardAnimations(manifest: AiAssetManifest): void {
  const guard = manifest.assets.guard;
  if (!guard) return;
  guard.linkedAnimationAssets ??= {};
  for (const [key, link] of Object.entries(guardAnimationLinks)) guard.linkedAnimationAssets[key] ??= structuredClone(link);
  for (const [id, definition] of Object.entries(guardAnimationDefinitions)) {
    manifest.assets[id] ??= structuredClone(definition);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', 'Characters'];
  }
}
