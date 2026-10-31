import type { AiAssetManifest } from '@ai-game-assets/core';

/** Initial authoring data only. Live edits (including removing a tag) stay authoritative. */
export function seedAudioFrameTags(manifest: AiAssetManifest): void {
  const entries: [string, string, number][] = [
    ['cage-door.close', 'shut', -1], ['cage-door.open', 'break', 1], ['guard.drink', 'slurp', 2], ['guard.collapse', 'fall', 5],
    ['miner.idle-front', 'slurp', 6], ['borin.pour-back', 'pour', 2],
    ['borin.tie-rope-back', 'tie', 0], ['borin.pickaxe-back', 'strike', 3],
    ['tool-chest.open', 'glow', 1], ['journal.quill.write', 'write', 2],
  ];
  for (const id of Object.keys(manifest.assets).filter(id => id.startsWith('door.'))) {
    if (id.endsWith('.close')) entries.push([id, 'shut', -1]);
    else if (id.endsWith('.open')) entries.push([id, 'open', 0]);
  }
  for (const [id, tag, slot] of entries) {
    const clip = manifest.assets[id]?.animations?.[0];
    if (!clip?.frames.length || clip.frameTimings?.some(t => t.tag === tag)) continue;
    const index = slot < 0 ? clip.frames.length - 1 : Math.min(slot, clip.frames.length - 1);
    clip.frameTimings ??= [];
    while (clip.frameTimings.length < clip.frames.length) clip.frameTimings.push({});
    if (!clip.frameTimings[index]!.tag) clip.frameTimings[index]!.tag = tag;
  }
}
