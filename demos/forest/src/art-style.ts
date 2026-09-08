import type { AiAssetManifest } from '@ai-game-assets/core';

/** The existing village frame is the shared visual reference for future asset generations. */
export const bramblehollowStyleGuide: NonNullable<AiAssetManifest['styleGuide']> = {
  prompt: 'Match the Bramblehollow reference: richly detailed, blocky pixel art for a classic point-and-click fantasy adventure. Use crisp, visible pixel clusters; deep blue-green forest shadows, mossy greens, warm earthy stone and timber, and amber lantern and window light. Weathered dwarf cottages nestle among ancient trees, roots, moss and mushrooms. Maintain the reference\'s coherent lighting, textured materials, readable silhouettes and layered woodland depth. Adapt these qualities to each requested room, character or object while keeping its required framing and transparency.',
  images: [{ name: 'Bramblehollow', file: 'art/bramblehollow-reference.png', mimeType: 'image/png' }],
};
