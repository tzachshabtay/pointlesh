import type { AiAssetManifest } from '@ai-game-assets/core';
import { intro, ending } from './story';

export const NARRATOR_VOICE = 'voice.narrator';
export function narrationLineId(kind: 'intro' | 'ending', index: number): string | undefined {
  const step = (kind === 'intro' ? intro : ending)[index];
  return step?.narration ? `line.narrator.${kind}.${step.narration}` : undefined;
}

/** Audio-only narration, authored under the same voice/line controls as dialogue. */
export function addNarratorAssets(manifest: AiAssetManifest): void {
  const voice = manifest.assets[NARRATOR_VOICE] ??= {
    id: NARRATOR_VOICE, kind: 'voice', activeVersion: '', versions: {},
    prompt: 'A warm, resonant fantasy storyteller with a gentle dwarven lilt. Mature, clear and intimate, with dry humour. Ominous restraint in danger and quiet joy at homecoming. Natural spoken narration, no music or sound effects.',
    voiceSettings: { text: 'In the oldest woods, even the smallest dwarf can leave a story worth remembering.' },
  };
  (manifest.assetPaths ??= {})[NARRATOR_VOICE] ??= ['Voices'];
  for (const kind of ['intro', 'ending'] as const) {
    (kind === 'intro' ? intro : ending).forEach((step, index) => {
      const id = narrationLineId(kind, index);
      if (!id) return;
      manifest.assets[id] ??= {
        id, kind: 'voice-line', prompt: step.text, activeVersion: '', versions: {},
        voiceSettings: { voiceAssetId: NARRATOR_VOICE, text: step.text, direction: '' },
      };
      (voice.linkedAnimationAssets ??= {})[id] ??= {
        assetId: id, label: `${kind === 'intro' ? 'Introduction' : 'Ending'} · ${step.speaker}`,
      };
    });
  }
}
