import type { AiAssetManifest } from "@ai-game-assets/core";
import { AiAssetRuntime, createAiAnimations, loadAiAssetSet, loadAiAssets, type AiAssetRuntimeOptions, type LoadAiAssetSetOptions } from "@ai-game-assets/phaser";
import type Phaser from "phaser";

/** Call in preload(). Uses ai-assets target resolution, collections and generated versions. */
export function loadPointleshAssets(scene: Phaser.Scene, manifest: AiAssetManifest, options: LoadAiAssetSetOptions & { assetIds?: string[] } = {}) {
  return options.assetIds ? loadAiAssetSet(scene, manifest, options.assetIds, options) : loadAiAssets(scene, manifest, options);
}

/** Call in create(), after textures have loaded. Bind sprites through the returned runtime. */
export function createPointleshAssetRuntime(scene: Phaser.Scene, manifest: AiAssetManifest, options: AiAssetRuntimeOptions & { assetIds?: string[] } = {}): AiAssetRuntime {
  const runtime = new AiAssetRuntime(scene, manifest, options);
  for (const assetId of options.assetIds ?? Object.keys(manifest.assets)) {
    if (manifest.assets[assetId]?.animations?.length) createAiAnimations(scene, manifest, { assetId, targetId: options.targetId });
  }
  return runtime;
}

export { AiAssetRuntime, createAiAnimations, loadAiAsset, loadAiAssetSet, loadAiAudioAssets, loadAiAssets, installAiAssetDesigner } from "@ai-game-assets/phaser";
