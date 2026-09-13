import type Phaser from "phaser";

export type PhaserDisplayResolutionOptions = {
  /** Cap physical pixels per CSS pixel to bound GPU cost. Defaults to 2. */
  maxPixelRatio?: number;
};

const installations = new WeakMap<Phaser.Game, { destroy(): void }>();

/**
 * Render Phaser 4's canvas at its displayed device resolution while keeping
 * game coordinates, camera matrices and pointer/designer coordinates logical.
 * Texture filtering remains a separate choice (installPhaserTextureScaling).
 * Offscreen render targets retain their own explicit resolution. WebGL only;
 * Canvas games keep their configured resolution.
 */
export function installPhaserDisplayResolution(game: Phaser.Game, options: PhaserDisplayResolutionOptions = {}): { destroy(): void } {
  const installed = installations.get(game);
  if (installed) return installed;
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  if (!Number.isFinite(maxPixelRatio) || maxPixelRatio <= 0) throw new Error("Maximum pixel ratio must be positive and finite.");
  const renderer = game.renderer;
  if (!("glWrapper" in renderer)) return { destroy() {} };
  const canvas = game.canvas;
  const view = canvas.ownerDocument.defaultView!;
  const wrapper = renderer.glWrapper;
  const originalUpdate = wrapper.update;
  const previousRendering = canvas.style.imageRendering;
  canvas.style.imageRendering = "auto";
  let scaleX = 1, scaleY = 1, dirty = true, lastRatio = 0, width = 0, height = 0;
  const maximum = renderer.gl.getParameter(renderer.gl.MAX_VIEWPORT_DIMS) as Int32Array;

  // Phaser 4 has logical drawing contexts but no game-config resolution option.
  // Adapt only the canvas framebuffer's viewport/scissor at the GL boundary.
  // Never mutate cached DrawingContext state or scale offscreen textures.
  // Phaser's generated declarations flatten these nested fields and incorrectly
  // type viewport as Int32Array[]. Keep the runtime shape at this boundary.
  type DrawState = { bindings?: { framebuffer?: unknown }; viewport?: number[]; scissor?: { box?: number[] } };
  const update: typeof originalUpdate = function (parameters, force, vaoLast) {
    let state = parameters as DrawState | undefined;
    const base = renderer.baseDrawingContext.state as DrawState;
    if (state && parameters !== wrapper.state && state.bindings?.framebuffer === base.bindings?.framebuffer) {
      const rectangle = (box: number[]) => box.map((n, i) => Math.round(n * (i % 2 ? scaleY : scaleX)));
      state = {
        ...state,
        ...(state.viewport ? { viewport: rectangle(state.viewport) } : {}),
        ...(state.scissor?.box ? { scissor: { ...state.scissor, box: rectangle(state.scissor.box) } } : {}),
      };
    }
    originalUpdate.call(wrapper, state as typeof parameters, force, vaoLast);
  };
  wrapper.update = update;
  const sync = () => {
    const ratio = Math.min(maxPixelRatio, view.devicePixelRatio || 1);
    if (dirty || ratio !== lastRatio) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const contain = view.getComputedStyle(canvas).objectFit === "contain";
      const fit = Math.min(rect.width / renderer.width, rect.height / renderer.height);
      width = Math.max(1, Math.min(maximum[0]!, Math.round((contain ? renderer.width * fit : rect.width) * ratio)));
      height = Math.max(1, Math.min(maximum[1]!, Math.round((contain ? renderer.height * fit : rect.height) * ratio)));
      lastRatio = ratio;
      dirty = false;
    }
    scaleX = width / renderer.width;
    scaleY = height / renderer.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      // Canvas resizing can reset GL state even when cached values are equal.
      originalUpdate.call(wrapper, undefined, true);
    }
  };
  const resized = () => { dirty = true; };
  const observer = new ResizeObserver(resized);
  observer.observe(canvas);
  game.scale.on("resize", resized);
  renderer.on("prerenderclear", sync);
  sync();
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    renderer.off("prerenderclear", sync);
    game.scale.off("resize", resized);
    game.events.off("destroy", destroy);
    if (wrapper.update === update) wrapper.update = originalUpdate;
    canvas.width = renderer.width;
    canvas.height = renderer.height;
    if (canvas.style.imageRendering === "auto") canvas.style.imageRendering = previousRendering;
    installations.delete(game);
  };
  const result = { destroy };
  installations.set(game, result);
  game.events.once("destroy", destroy);
  return result;
}
