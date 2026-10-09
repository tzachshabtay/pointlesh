import type { AiAssetManifest } from '@ai-game-assets/core';

export const MINE_OVERSCAN_ASSET = 'background.mine-overscan';
// Original atlas crop stays at (0,0) in the room. Only this backing image
// extends beyond it; all objects, walk areas, masks and camera bounds stay put.
export function mineOverscanBounds(width: number, height: number) {
  return { x: -177 / 1182 * width, y: -180 / 664 * height,
    width: 1536 / 1182 * width, height: 1024 / 664 * height };
}

export function addMineOverscanAsset(manifest: AiAssetManifest): void {
  manifest.assets[MINE_OVERSCAN_ASSET] ??= {
    id: MINE_OVERSCAN_ASSET, kind: 'image', dimensions: { width: 1536, height: 1024 },
    prompt: 'Extend only the margins around the existing Goldroot Mine: gold-veined rock ceiling and walls, warm ochre rock floor. Preserve the original 1182×664 scene at (177,180) unchanged. No new objects or landmarks. Full outpainting prompt in docs/art-prompts.md.',
    activeVersion: 'outpaint', versions: { outpaint: { name: 'outpaint', file: 'art/mine-overscan.png',
      model: 'imagegen', createdAt: '2026-10-08T00:00:00.000Z',
      prompt: 'Outpaint the gray padding around the original mine crop without reframing or altering its center. Match the pixel scale, palette, rock and floor textures.',
      notes: 'Backing scenery for zoom-out transitions only. The original room background is rendered above this image at its unchanged world coordinates.' } },
    tags: ['forest', 'background', 'overscan'],
  };
  (manifest.assetPaths ??= {})[MINE_OVERSCAN_ASSET] ??= ['Graphics', 'Backgrounds'];
}

// Feather a short reflected edge into the outpaint, outside the room only.
// AI outpainting cannot guarantee pixel-identical joins; this keeps the border
// continuous even when the background is swapped in the asset designer.
export const MINE_EDGE_PADDING = 48;
export function drawMineEdgeBlend(context: CanvasRenderingContext2D, source: HTMLCanvasElement, width: number, height: number) {
  const padding = MINE_EDGE_PADDING;
  const canvas = context.canvas;
  canvas.width = width + padding * 2;
  canvas.height = height + padding * 2;
  context.imageSmoothingEnabled = false;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    context.save();
    context.translate(padding + (x === -1 ? 0 : x === 1 ? width * 2 : 0), padding + (y === -1 ? 0 : y === 1 ? height * 2 : 0));
    context.scale(x === 0 ? 1 : -1, y === 0 ? 1 : -1);
    context.drawImage(source, 0, 0, width, height);
    context.restore();
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const distance = Math.max(padding - x, x - (padding + width - 1), padding - y, y - (padding + height - 1), 0);
    const t = Math.min(1, distance / padding);
    pixels.data[(y * canvas.width + x) * 4 + 3] = distance === 0 ? 0 : Math.round(255 * (1 - t * t * (3 - 2 * t)));
  }
  context.putImageData(pixels, 0, 0);
}
