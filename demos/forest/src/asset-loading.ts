import type Phaser from 'phaser';
import type { AiAssetManifest } from '@ai-game-assets/core';
import { loadAiAssets, loadAiAudioAsset } from '@ai-game-assets/phaser';

/** ai-assets loads graphics and audio separately; queue both before play begins. */
export function loadForestAssets(scene: Phaser.Scene, manifest: AiAssetManifest, baseUrl: string): void {
  loadAiAssets(scene, manifest, { baseUrl });
  for (const asset of Object.values(manifest.assets)) {
    if (asset.kind === 'music' || asset.kind === 'sound' || asset.kind === 'voice-line') {
      // The audio loader skips lines that have no generated recording yet.
      loadAiAudioAsset(scene, manifest, asset.id, { baseUrl });
    }
  }
}
