import type { AiAssetAnimation } from '@ai-game-assets/core';
import { animationDuration, animationTagTime } from '@pointlesh/phaser/animation-tags';
import { PICKAXE_START_MS } from './rescue-assets';

/** The camera timeline controls the shot; authored frame tags control the sound. */
export function cinematicAudioCue(kind: 'intro' | 'ending', step: number, previousStep: number, before: number, after: number, duration: number,
  clips: { cageClose?: AiAssetAnimation; pickaxe?: AiAssetAnimation } = {}): string | undefined {
  if (step !== previousStep || after <= before || after - before > 250) return;
  const shut = animationTagTime(clips.cageClose, 'shut'), strike = animationTagTime(clips.pickaxe, 'strike');
  const at = kind === 'intro' && step === 2 && shut !== undefined
    ? duration * (.69 + .18 * shut / animationDuration(clips.cageClose))
    : kind === 'ending' && step === 0 && strike !== undefined ? PICKAXE_START_MS + strike : undefined;
  if (at !== undefined && before < at && after >= at) return kind === 'intro' ? 'cage-close' : 'lock-break';
}
