import { applyAiAnimationFrameTransform, type AiAssetRuntime, type AiAssetAnimationPlayback, type AiAssetTextureBinding } from "@ai-game-assets/phaser";
import type { CharacterController, CharacterSnapshot, Point, ResolvedPointleshArea } from "@pointlesh/core";
import type Phaser from "phaser";
import { evaluatePointleshAreaEffects, type PointleshAreaEffects } from "./effects.js";

export type PhaserAdventureCharacterOptions = {
  /** Read fresh resolved areas here to reflect designer edits without rebuilding the binding. */
  areas?: () => readonly ResolvedPointleshArea[];
  /** Only the player usually controls the camera; omit for NPCs. */
  camera?: Phaser.Cameras.Scene2D.Camera;
  baseScale?: number | Point;
  defaultScale?: number;
  defaultZoom?: number;
  depthOffset?: number;
  origin?: Point;
  flipLeft?: boolean;
  /** Set false when calling update(deltaMs) yourself. Never tick the same actor twice. */
  autoUpdate?: boolean;
  /** Select a texture frame from activity, facing and deterministic animationFrame. */
  frame?: (snapshot: CharacterSnapshot) => string | number;
  /** Optional ai-assets binding retains generated texture previews and promotions. */
  aiRuntime?: AiAssetRuntime;
  assetId?: string;
  /** ai-assets state or animation key. Playback is stepped by the core actor's clock. */
  animation?: (snapshot: CharacterSnapshot) => string | undefined;
  onSync?: (snapshot: CharacterSnapshot, effects: PointleshAreaEffects) => void;
};

/** Phaser owns drawing, while the serializable core controller owns movement and animation time. */
export class PhaserAdventureCharacter {
  private readonly baseScale: Point;
  private binding?: AiAssetTextureBinding;
  private playback?: AiAssetAnimationPlayback;
  private animationKey?: string;
  private destroyed = false;
  private readonly onUpdate = (_time: number, delta: number) => this.update(delta);

  constructor(
    readonly scene: Phaser.Scene,
    readonly controller: CharacterController,
    readonly sprite: Phaser.GameObjects.Sprite,
    readonly options: PhaserAdventureCharacterOptions = {},
  ) {
    if (options.assetId && !options.aiRuntime) throw new Error("assetId requires an aiRuntime.");
    this.baseScale = typeof options.baseScale === "number" ? { x: options.baseScale, y: options.baseScale } : options.baseScale ?? { x: sprite.scaleX, y: sprite.scaleY };
    sprite.setOrigin(options.origin?.x ?? 0.5, options.origin?.y ?? 1);
    if (options.aiRuntime && options.assetId) this.binding = options.aiRuntime.bindTexture(sprite, options.assetId);
    if (options.autoUpdate !== false) scene.events.on("update", this.onUpdate);
    scene.events.once("shutdown", this.destroy, this);
    sprite.once("destroy", this.destroy, this);
    this.sync();
  }

  /** Apply perspective scale before ticking so the controller also scales walking distance. */
  update(deltaMs: number): void {
    if (this.destroyed) return;
    const effects = this.effects();
    this.controller.setScale(effects.scale);
    this.controller.tick(deltaMs);
    this.render(this.effects(), deltaMs);
  }

  /** Refresh after loading or a live designer edit without advancing simulation time. */
  sync(): void {
    if (this.destroyed) return;
    const effects = this.effects();
    this.controller.setScale(effects.scale);
    this.render(effects);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off("update", this.onUpdate);
    this.scene.events.off("shutdown", this.destroy, this);
    this.sprite.off("destroy", this.destroy, this);
    this.playback?.destroy();
    this.binding?.destroy();
  }

  private effects(): PointleshAreaEffects {
    return evaluatePointleshAreaEffects(this.options.areas?.() ?? [], this.controller.state.position, { defaultScale: this.options.defaultScale, defaultZoom: this.options.defaultZoom });
  }

  private render(effects: PointleshAreaEffects, deltaMs?: number): void {
    const state = this.controller.state;
    this.controller.setScale(effects.scale);
    this.sprite.setPosition(state.position.x, state.position.y);
    this.sprite.setDepth((this.options.depthOffset ?? 0) + state.position.y);
    this.sprite.setScale(this.baseScale.x * effects.scale, this.baseScale.y * effects.scale);
    if (this.options.flipLeft) this.sprite.setFlipX(state.facing.includes("left"));
    const key = this.options.animation?.(state);
    if (key !== this.animationKey) {
      this.playback?.destroy();
      this.playback = undefined;
      this.animationKey = key;
      this.sprite.anims.stop();
      if (key && this.options.aiRuntime && this.options.assetId) {
        this.playback = this.options.aiRuntime.playAnimation(this.sprite, this.options.assetId, key, { applyFrameTransforms: false });
        this.sprite.anims.pause();
      }
    }
    const frames = this.playback ? this.sprite.anims.currentAnim?.frames : undefined;
    if (frames?.length) {
      const slot = state.animationFrame % frames.length;
      this.sprite.anims.setCurrentFrame(frames[slot]!);
      // Compose generated offsets/scales with live perspective. A free-running
      // animation listener would otherwise overwrite the area's visual scale.
      applyAiAnimationFrameTransform(this.sprite, this.playback?.animation, slot,
        { width: this.sprite.width * this.baseScale.x * effects.scale, height: this.sprite.height * this.baseScale.y * effects.scale },
        { originX: this.options.origin?.x ?? 0.5, originY: this.options.origin?.y ?? 1 });
    }
    else if (this.options.frame) this.sprite.setFrame(this.options.frame(state));
    if (this.options.camera) {
      const camera = this.options.camera;
      const amount = deltaMs === undefined || effects.zoomSmoothing === 0 ? 1 : 1 - Math.exp(-effects.zoomSmoothing * deltaMs / 1000);
      camera.setZoom(camera.zoom + (effects.zoom - camera.zoom) * amount);
    }
    this.options.onSync?.(state, effects);
  }
}
