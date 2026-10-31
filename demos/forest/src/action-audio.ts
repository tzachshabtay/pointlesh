import type { AiAssetAnimation } from '@ai-game-assets/core';
import { animationDuration, animationTagTime } from '@pointlesh/phaser/animation-tags';
import { PICKAXE_START_MS, PICKAXE_IMPACT_MS } from './rescue-assets';

/** Shared with the rendered door so audio follows its actual animation clock. */
export function cageOpeningStartMs(pickaxe?: AiAssetAnimation): number {
  return PICKAXE_START_MS + (animationTagTime(pickaxe, 'strike') ?? PICKAXE_IMPACT_MS);
}

/** The camera timeline controls the shot; authored frame tags control the sound. */
export function cinematicAudioCue(kind: 'intro' | 'ending', step: number, previousStep: number, before: number, after: number, duration: number,
  clips: { cageClose?: AiAssetAnimation; pickaxe?: AiAssetAnimation; cageOpen?: AiAssetAnimation } = {}): string | undefined {
  if (step !== previousStep || after <= before || after - before > 250) return;
  const shut = animationTagTime(clips.cageClose, 'shut'), breakTime = animationTagTime(clips.cageOpen, 'break');
  const at = kind === 'intro' && step === 2 && shut !== undefined
    ? duration * (.69 + .18 * shut / animationDuration(clips.cageClose))
    : kind === 'ending' && step === 0 && breakTime !== undefined ? cageOpeningStartMs(clips.pickaxe) + breakTime : undefined;
  if (at !== undefined && before < at && after >= at) return kind === 'intro' ? 'cage-close' : 'lock-break';
}
