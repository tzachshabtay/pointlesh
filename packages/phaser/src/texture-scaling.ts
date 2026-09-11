import type Phaser from "phaser";

export type TextureScaling = "nearest" | "linear" | "smooth-pixel-art";

export type PhaserTextureScalingOptions = {
  /** Sampling used for existing textures and future loads, including asset previews. */
  default: TextureScaling;
  /** Override by texture; undefined uses the default. Textures are shared across sprites/scenes. */
  resolve?: (texture: Phaser.Textures.Texture) => TextureScaling | undefined;
  /** Browser resampling of the final canvas is separate from texture sampling. */
  canvas?: "auto" | "pixelated" | "crisp-edges";
};

/** Select sampling for a whole texture, including every animation frame. */
export function setTextureScaling(texture: Phaser.Textures.Texture, mode: TextureScaling): void {
  texture.setSmoothPixelArt(mode === "smooth-pixel-art");
  // Phaser.Textures.FilterMode: LINEAR = 0, NEAREST = 1.
  texture.setFilter(mode === "nearest" ? 1 : 0);
}

/** Install once in the owning scene's create(). Applies to the shared game texture manager. */
export function installPhaserTextureScaling(scene: Phaser.Scene, options: PhaserTextureScalingOptions): { destroy(): void } {
  const apply = (_key: string, texture: Phaser.Textures.Texture) => {
    setTextureScaling(texture, options.resolve?.(texture) ?? options.default);
  };
  for (const texture of Object.values(scene.textures.list)) apply(texture.key, texture);
  scene.textures.on("addtexture", apply);
  const canvas = scene.game.canvas;
  const previousRendering = canvas.style.imageRendering;
  if (options.canvas !== undefined) canvas.style.imageRendering = options.canvas;
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.textures.off("addtexture", apply);
    scene.events.off("shutdown", destroy);
    if (options.canvas !== undefined && canvas.style.imageRendering === options.canvas) canvas.style.imageRendering = previousRendering;
  };
  scene.events.once("shutdown", destroy);
  return { destroy };
}
