import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';

export const CHEST_OPEN_TIMINGS = [160, 220, 220, 220, 240, 240, 220, 480];
export const CHEST_OPEN_DURATION_MS = CHEST_OPEN_TIMINGS.reduce((sum, delay) => sum + delay, 0);
const prompt = 'Animate the exact runed oak chest: amber runes brighten, the fixed rear hinge lifts the lid, and a pickaxe is revealed. Final empty pose after collection. Same chest body, scale and foot anchor; transparent background. Full prompt in docs/art-prompts.md.';
const version = (file: string) => ({ name: 'opening', file, prompt, model: 'imagegen', createdAt: '2026-10-01T00:00:00.000Z' });
const animation = (id: string, frames: number[], timings: number[]): AiAssetDefinition => ({
  id, kind: 'animation', prompt, dimensions: { width: 360, height: 360 },
  frameGrid: { frameWidth: 120, frameHeight: 120, columns: 3, rows: 3, frameCount: 9 },
  animations: [{ key: id, frames, frameRate: 8, repeat: 0, frameTimings: timings.map(delayMs => ({ delayMs })) }],
  settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
  activeVersion: 'opening', versions: { opening: version('art/objects/runed-tool-chest-open.png') }, tags: ['forest', 'object', 'mine'],
});

export function addChestAssets(manifest: AiAssetManifest): void {
  const chest = manifest.assets['tool-chest'];
  if (chest) {
    // Extra transparent headroom for the raised lid, without resizing the body.
    if (chest.activeVersion === 'runed' && chest.dimensions?.height === 80) {
      chest.dimensions = { width: 120, height: 120 };
      chest.versions.opening = version('art/objects/runed-tool-chest-padded.png');
      chest.activeVersion = 'opening';
    }
    (chest.linkedAnimationAssets ??= {}).open ??= { assetId: 'tool-chest.open', label: 'Runes glow · open lid' };
    chest.linkedAnimationAssets.empty ??= { assetId: 'tool-chest.empty', label: 'Open · empty' };
  }
  for (const definition of [animation('tool-chest.open', [0,1,2,3,4,5,6,7], CHEST_OPEN_TIMINGS), animation('tool-chest.empty', [8], [1000])]) {
    manifest.assets[definition.id] ??= definition;
    (manifest.assetPaths ??= {})[definition.id] ??= ['Graphics', 'Objects'];
  }
}
