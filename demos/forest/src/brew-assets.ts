import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';

export const POUR_DURATION_MS = 1800;
const version = (file: string, prompt: string) => ({ name: 'purple-brew', file, prompt, model: 'imagegen', createdAt: '2026-10-01T00:00:00.000Z', notes: 'Generated from the current Borin and tankard references. Prompts and source sheets in art-source/brew. Packed with one scale and fixed feet/mug anchors.' });
const sheet = (id: string, file: string, size: number, prompt: string, loop: boolean): AiAssetDefinition => ({
  id, kind: 'animation', prompt, dimensions: { width: size * 4, height: size * 2 },
  frameGrid: { frameWidth: size, frameHeight: size, columns: 4, rows: 2, frameCount: 8 },
  animations: [{ key: id, frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 8, repeat: loop ? -1 : 0, ...(!loop ? { frameTimings: Array.from({ length: 8 }, () => ({ delayMs: POUR_DURATION_MS / 8 })) } : {}) }],
  settings: { format: 'png', background: 'transparent', frameAlignment: 'none' },
  activeVersion: 'purple-brew', versions: { 'purple-brew': version(file, prompt) }, tags: ['forest', id.startsWith('inventory.') ? 'inventory' : 'character'],
});
export const brewAssets: Record<string, AiAssetDefinition> = {
  'inventory.sleepyStout.idle': sheet('inventory.sleepyStout.idle', 'art/interface/inventory.sleepyStout.purple-idle.png', 32, 'Purple dreamcap stout bubbles and oozes gently over the copper-banded wooden tankard. Eight frames, fixed mug position, transparent pixel art, seamless loop.', true),
  'borin.pour-back': sheet('borin.pour-back', 'art/characters/borin/pour-back.png', 200, 'The current Borin from behind raises the purple stout tankard, tips it into an unseen cauldron, then lowers it. Eight full-body frames with fixed body scale and feet; no scenery.', false),
};

/** Upgrade only the original yellow placeholder; preserve subsequent designer promotions. */
export function addBrewAssets(manifest: AiAssetManifest): void {
  for (const [id, asset] of Object.entries(brewAssets)) {
    manifest.assets[id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', id.startsWith('inventory.') ? 'Inventory' : 'Characters'];
  }
  const mug = manifest.assets['inventory.sleepyStout'];
  if (mug) {
    (mug.linkedAnimationAssets ??= {}).idle ??= { label: 'Bubbling ooze', assetId: 'inventory.sleepyStout.idle' };
    mug.versions['purple-brew'] ??= version('art/interface/inventory.sleepyStout.purple.png', 'Honey stout mixed with violet dreamcap mushrooms. Purple bubbling ooze, copper-banded wooden mug, transparent pixel art.');
    if (mug.activeVersion === 'original') mug.activeVersion = 'purple-brew';
    if (mug.activeVersion === 'purple-brew') mug.prompt = mug.versions['purple-brew']!.prompt;
  }
  const click = manifest.assets['inventory.sleepyStout.click'];
  if (click && click.activeVersion === 'original') {
    const replacement = sheet(click.id, 'art/interface/inventory.sleepyStout.purple-idle.png', 32, brewAssets['inventory.sleepyStout.idle']!.prompt, false);
    Object.assign(click, { ...replacement, versions: { ...click.versions, ...replacement.versions } });
    click.animations![0]!.frameRate = 12;
    delete click.animations![0]!.frameTimings;
  }
  const borin = manifest.assets.borin;
  if (borin) (borin.linkedAnimationAssets ??= {})['pour-back'] ??= { label: 'Pour brew · back', assetId: 'borin.pour-back' };
}
