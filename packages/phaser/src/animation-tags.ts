import type { AiAssetAnimation } from '@ai-game-assets/core';

export function animationDuration(animation: AiAssetAnimation | undefined): number {
  return animation?.frames.reduce((sum, _frame, i) => sum + (animation.frameTimings?.[i]?.delayMs ?? 1000 / animation.frameRate), 0) ?? 0;
}
/** Tags belong to playback slots, including reversed/non-sequential sprite sheets. */
export function animationTagTime(animation: AiAssetAnimation | undefined, tag: string): number | undefined {
  if (!animation) return;
  let time = 0;
  for (let i = 0; i < animation.frames.length; i++) {
    if (animation.frameTimings?.[i]?.tag === tag) return time;
    time += animation.frameTimings?.[i]?.delayMs ?? 1000 / animation.frameRate;
  }
}
export function crossedAnimationTag(animation: AiAssetAnimation | undefined, tag: string, before: number, after: number): boolean {
  const time = animationTagTime(animation, tag);
  return time !== undefined && after > before && before <= time && after >= time && (before < time || time === 0);
}
/** One-based Phaser animation slots; works on wrap and skips across dropped frames. */
export function crossedAnimationFrameTag(animation: AiAssetAnimation | undefined, tag: string, before: number, after: number): boolean {
  if (!animation || before <= 0 || after <= 0 || before === after) return false;
  return animation.frameTimings?.some((frame, i) => frame.tag === tag &&
    (after < before ? i + 1 > before || i + 1 <= after : i + 1 > before && i + 1 <= after)) ?? false;
}
