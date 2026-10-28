import { PICKAXE_START_MS, PICKAXE_IMPACT_MS } from './rescue-assets';

/** A seek/restore is silent; ordinary animation ticks emit each cue just once. */
export function cinematicAudioCue(kind: 'intro' | 'ending', step: number, previousStep: number, before: number, after: number, duration: number): string | undefined {
  if (step !== previousStep || after < before || after - before > 250) return;
  const at = kind === 'intro' && step === 2 ? duration * .69
    : kind === 'ending' && step === 0 ? PICKAXE_START_MS + PICKAXE_IMPACT_MS : undefined;
  if (at !== undefined && before < at && after >= at) return kind === 'intro' ? 'cage-close' : 'lock-break';
}

/** Orrin lifts the mug to his mouth in the seventh of sixteen idle frames. */
export function minerSipCue(before: number, after: number, frames: number): boolean {
  if (frames < 8 || before <= 0 || after <= 0) return false;
  const sipFrame = Math.floor(frames * .375) + 1;
  return (after < before ? 0 : before) < sipFrame && after >= sipFrame;
}
