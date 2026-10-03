import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';

export const JOURNAL_QUILL_ASSET = 'journal.quill';
export const JOURNAL_SCROLL_ASSET = 'journal.scroll';
const prompt = 'An ivory feather quill writing three short ink lines on warm parchment. Crisp fantasy pixel art, transparent background, stationary page, no hand or readable text.';
const version = (file: string) => ({ name: 'original', file, prompt, model: 'imagegen', createdAt: '2026-10-02T00:00:00.000Z',
  notes: 'Generated with the built-in image_gen tool. Full prompt in art-source/journal/quill-writing.txt; pack with scripts/pack-journal-art.mjs.' });
export const journalAssets: Record<string, AiAssetDefinition> = {
  [JOURNAL_SCROLL_ASSET]: {
    id: JOURNAL_SCROLL_ASSET, kind: 'image',
    prompt: 'An unrolled blank parchment scroll matching the journal quill, warm golden paper, worn irregular pixel-art edges, compact curled top and bottom. Transparent background. No text or props.',
    dimensions: { width: 1024, height: 1536 }, settings: { format: 'png', background: 'transparent' }, tags: ['forest', 'journal', 'ui'],
    activeVersion: 'original', versions: { original: {
      name: 'original', file: 'art/journal/scroll.png', model: 'imagegen', createdAt: '2026-10-03T00:00:00.000Z',
      prompt: 'Blank parchment scroll, using the journal quill as a style reference.',
      notes: 'Generated with the built-in image_gen tool. Full prompt in art-source/journal/scroll.txt.',
    } },
  },
  [JOURNAL_QUILL_ASSET]: {
    id: JOURNAL_QUILL_ASSET, kind: 'image', prompt, dimensions: { width: 256, height: 256 },
    settings: { format: 'png', background: 'transparent' }, tags: ['forest', 'journal', 'ui'],
    linkedAnimationAssets: { write: { assetId: `${JOURNAL_QUILL_ASSET}.write`, label: 'Write a note' } },
    activeVersion: 'original', versions: { original: version('art/journal/quill.png') },
  },
  [`${JOURNAL_QUILL_ASSET}.write`]: {
    id: `${JOURNAL_QUILL_ASSET}.write`, kind: 'animation', prompt: `${prompt} Sixteen sequential writing frames, four columns by four rows. Finish by lifting the quill.`,
    dimensions: { width: 1024, height: 1024 },
    frameGrid: { frameWidth: 256, frameHeight: 256, columns: 4, rows: 4, frameCount: 16 },
    animations: [{ key: `${JOURNAL_QUILL_ASSET}.write`, frames: Array.from({ length: 16 }, (_, i) => i), frameRate: 8, repeat: 0 }],
    settings: { format: 'png', background: 'transparent', frameAlignment: 'none' }, tags: ['forest', 'journal', 'ui'],
    activeVersion: 'original', versions: { original: version('art/journal/quill.write.png') },
  },
};

/** Add journal art without replacing promoted versions or folder edits. */
export function addJournalAssets(manifest: AiAssetManifest): void {
  for (const [id, asset] of Object.entries(journalAssets)) {
    manifest.assets[id] ??= structuredClone(asset);
    (manifest.assetPaths ??= {})[id] ??= ['Graphics', 'Interface', 'Journal'];
  }
}
