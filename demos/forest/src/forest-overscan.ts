import type Phaser from 'phaser';
import type { AiAssetManifest } from '@ai-game-assets/core';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';

export const FOREST_OVERSCAN_ASSET = 'background.forest-overscan';
const EDGE_KEY = 'room.forest-bottom-edge';
const TOP_EDGE_KEY = 'room.forest-top-edge';
const EDGE_HEIGHT = 48;

export function addForestOverscanAsset(manifest: AiAssetManifest): void {
  manifest.assets[FOREST_OVERSCAN_ASSET] ??= {
    id: FOREST_OVERSCAN_ASSET, kind: 'image', dimensions: { width: 1774, height: 887 },
    prompt: 'Extend only the bottom of the Whispering Wood with shaded dirt, small stones, leaf litter and moss. Keep the original panorama in the upper two thirds unchanged. Full outpainting prompt in docs/art-prompts.md.',
    activeVersion: 'outpaint', versions: { outpaint: { name: 'outpaint', file: 'art/forest-overscan.png',
      model: 'imagegen', createdAt: '2026-10-08T00:00:00.000Z',
      prompt: 'Outpaint only the gray bottom third; preserve the existing forest panorama, its placement, scale, shadows and palette.',
      notes: 'Backing scenery only. The original forest is rendered above it at unchanged world coordinates.' } },
    tags: ['forest', 'background', 'overscan'],
  };
  (manifest.assetPaths ??= {})[FOREST_OVERSCAN_ASSET] ??= ['Graphics', 'Backgrounds'];
}

/** Join below the original room; no pixels inside the normal scene are blended. */
export function drawForestEdgeTextures(scene: Phaser.Scene, source: HTMLCanvasElement, width: number, height: number): void {
  const texture = (scene.textures.exists(EDGE_KEY) ? scene.textures.get(EDGE_KEY) : scene.textures.createCanvas(EDGE_KEY, width, EDGE_HEIGHT)) as Phaser.Textures.CanvasTexture;
  texture.setSize(width, EDGE_HEIGHT);
  const context = texture.context;
  context.clearRect(0, 0, width, EDGE_HEIGHT);
  context.save();
  context.imageSmoothingEnabled = false;
  context.translate(0, height);
  context.scale(1, -1);
  context.drawImage(source, 0, 0, width, height);
  context.restore();
  const fade = context.createLinearGradient(0, 0, 0, EDGE_HEIGHT);
  fade.addColorStop(0, '#fff'); fade.addColorStop(1, '#fff0');
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = fade; context.fillRect(0, 0, width, EDGE_HEIGHT);
  context.restore();
  texture.setSmoothPixelArt(true);
  texture.refresh();
  // A centered zoom-out also reveals a narrow strip above the canopy.
  const top = (scene.textures.exists(TOP_EDGE_KEY) ? scene.textures.get(TOP_EDGE_KEY) : scene.textures.createCanvas(TOP_EDGE_KEY, width, EDGE_HEIGHT)) as Phaser.Textures.CanvasTexture;
  top.setSize(width, EDGE_HEIGHT);
  top.context.clearRect(0, 0, width, EDGE_HEIGHT);
  top.context.save();
  top.context.imageSmoothingEnabled = false;
  top.context.translate(0, EDGE_HEIGHT);
  top.context.scale(1, -1);
  top.context.drawImage(source, 0, 0, width, height);
  top.context.restore();
  top.setSmoothPixelArt(true);
  top.refresh();
}

/** Shared artwork placement for gameplay and the private cutscene world. */
export function createForestOverscan(scene: Phaser.Scene, assets: AiAssetRuntime) {
  const image = scene.add.image(0, 0, assets.key(FOREST_OVERSCAN_ASSET)).setOrigin(0).setDepth(-1001).setVisible(false);
  const binding = assets.bindTexture(image, FOREST_OVERSCAN_ASSET);
  image.once('destroy', () => binding.destroy());
  const edge = scene.add.image(0, 0, EDGE_KEY).setOrigin(0).setDepth(-1000.5).setVisible(false);
  const topEdge = scene.add.image(0, -EDGE_HEIGHT, TOP_EDGE_KEY).setOrigin(0).setDepth(-1000.5).setVisible(false);
  return {
    image, edge, topEdge,
    layout(room: string, width: number, height: number, tint = 0xffffff) {
      image.setVisible(room === 'forest').setDisplaySize(width, height * 1.5).setTint(tint);
      topEdge.setVisible(room === 'forest').setDisplaySize(width, EDGE_HEIGHT).setTint(tint);
      edge.setVisible(room === 'forest').setPosition(0, height).setDisplaySize(width, EDGE_HEIGHT).setTint(tint);
    },
  };
}
