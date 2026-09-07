import { applyAiAnimationFrameTransform, createAiAnimations, type AiAssetRuntime, type AiAssetAnimationPlayback, type AiAssetTextureBinding } from "@ai-game-assets/phaser";
import { resolveCharacterAnimation, type CharacterAnimations, type CharacterAnimationAssignment, type CharacterController, type CharacterSnapshot, type Point, type ResolvedPointleshArea } from "@pointlesh/core";
import type Phaser from "phaser";
import { evaluatePointleshAreaEffects, type PointleshAreaEffects } from "./effects.js";

// Multiple actors may share an authored clip. Rebuild a changed clip only once,
// then let each paused actor attach to the same new Phaser animation object.
const registeredDefinitions = new WeakMap<object, string>();

export type PhaserAdventureCharacterOptions = {
  /** Read fresh resolved areas here to reflect designer edits without rebuilding the binding. */
  areas?: () => readonly ResolvedPointleshArea[];
  /** Only the player usually controls the camera; omit for NPCs. */
  camera?: Phaser.Cameras.Scene2D.Camera;
  baseScale?: number | Point | (() => number | Point);
  defaultScale?: number;
  defaultZoom?: number;
  depthOffset?: number;
  origin?: Point | (() => Point);
  /** Authored base rotation in degrees, composed with generated frame rotations. */
  angle?: number | (() => number);
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
  /** Live prefab assignments take precedence over animation/frame callbacks when a slot resolves. */
  animations?: CharacterAnimations | (() => CharacterAnimations | undefined);
  onSync?: (snapshot: CharacterSnapshot, effects: PointleshAreaEffects) => void;
};

/** Phaser owns drawing, while the serializable core controller owns movement and animation time. */
export class PhaserAdventureCharacter {
  private readonly initialScale: Point;
  private readonly initialAngle: number;
  private readonly fallbackTiming: { frameCount: number; frameDurationMs: number };
  private binding?: AiAssetTextureBinding;
  private boundAssetId?: string;
  private playback?: AiAssetAnimationPlayback;
  private animationSelection?: string;
  private playbackSignature?: string;
  private selectedAssignment?: CharacterAnimationAssignment;
  private usingAuthoredTiming = false;
  private timingSignature?: string;
  private registeredAnimation?: Phaser.Animations.Animation;
  private destroyed = false;
  private readonly onUpdate = (_time: number, delta: number) => this.update(delta);

  constructor(
    readonly scene: Phaser.Scene,
    readonly controller: CharacterController,
    readonly sprite: Phaser.GameObjects.Sprite,
    readonly options: PhaserAdventureCharacterOptions = {},
  ) {
    if (options.assetId && !options.aiRuntime) throw new Error("assetId requires an aiRuntime.");
    if (options.animations && !options.aiRuntime) throw new Error("Character animations require an aiRuntime.");
    this.initialScale = { x: sprite.scaleX, y: sprite.scaleY };
    this.initialAngle = sprite.angle ?? 0;
    this.fallbackTiming = { frameCount: controller.config.frameCount, frameDurationMs: controller.config.frameDurationMs };
    const origin = this.origin(); sprite.setOrigin(origin.x, origin.y);
    this.bindAsset(options.assetId);
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
    this.prepareAnimation();
    const speechRemaining = this.controller.state.speech?.remainingMs;
    if (speechRemaining !== undefined && speechRemaining < deltaMs) {
      if (speechRemaining > 0) this.controller.tick(speechRemaining); else this.controller.finishSpeech();
      this.prepareAnimation();
      this.controller.tick(deltaMs - speechRemaining);
    } else this.controller.tick(deltaMs);
    this.render(this.effects(), deltaMs);
  }

  /** Refresh after loading or a live designer edit without advancing simulation time. */
  sync(): void {
    if (this.destroyed) return;
    const effects = this.effects();
    this.controller.setScale(effects.scale);
    this.render(effects);
  }

  /** Refresh after external asset changes; normal manifest/preview replacements are also detected automatically. */
  refreshAnimation(): void { this.playbackSignature = undefined; this.sync(); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off("update", this.onUpdate);
    this.scene.events.off("shutdown", this.destroy, this);
    this.sprite.off("destroy", this.destroy, this);
    this.playback?.destroy();
    this.binding?.destroy();
    this.restoreTiming();
  }

  private effects(): PointleshAreaEffects {
    return evaluatePointleshAreaEffects(this.options.areas?.() ?? [], this.controller.state.position, { defaultScale: this.options.defaultScale, defaultZoom: this.options.defaultZoom });
  }

  private render(effects: PointleshAreaEffects, deltaMs?: number): void {
    this.prepareAnimation();
    const state = this.controller.state;
    const baseScale = this.scale();
    const origin = this.origin();
    const angle = (typeof this.options.angle === 'function' ? this.options.angle() : this.options.angle) ?? this.initialAngle;
    this.controller.setScale(effects.scale);
    this.sprite.setPosition(state.position.x, state.position.y);
    this.sprite.setDepth((this.options.depthOffset ?? 0) + state.position.y);
    this.sprite.setScale(baseScale.x * effects.scale, baseScale.y * effects.scale);
    this.sprite.setOrigin(origin.x, origin.y);
    this.sprite.setRotation(angle * Math.PI / 180);
    if (this.selectedAssignment) this.sprite.setFlipX(this.selectedAssignment.flipX ?? false);
    else if (this.options.flipLeft) this.sprite.setFlipX(state.facing.includes("left"));
    const frames = this.playback ? this.sprite.anims.currentAnim?.frames : undefined;
    if (frames?.length) {
      const slot = state.animationFrame % frames.length;
      this.sprite.anims.pause();
      this.sprite.anims.setCurrentFrame(frames[slot]!);
      // Compose generated offsets/scales with live perspective. A free-running
      // animation listener would otherwise overwrite the area's visual scale.
      applyAiAnimationFrameTransform(this.sprite, this.playback?.animation, slot,
        { width: this.sprite.width * baseScale.x * effects.scale, height: this.sprite.height * baseScale.y * effects.scale },
        { originX: origin.x, originY: origin.y });
      this.sprite.setRotation((angle + (this.playback?.animation?.frameTimings?.[slot]?.rotation ?? 0)) * Math.PI / 180);
    }
    else if (this.options.frame) this.sprite.setFrame(this.options.frame(state));
    if (this.options.camera) {
      const camera = this.options.camera;
      const amount = deltaMs === undefined || effects.zoomSmoothing === 0 ? 1 : 1 - Math.exp(-effects.zoomSmoothing * deltaMs / 1000);
      camera.setZoom(camera.zoom + (effects.zoom - camera.zoom) * amount);
    }
    this.options.onSync?.(state, effects);
  }

  private scale(): Point {
    const value = typeof this.options.baseScale === 'function' ? this.options.baseScale() : this.options.baseScale;
    return typeof value === 'number' ? { x: value, y: value } : value ?? this.initialScale;
  }

  private origin(): Point { return (typeof this.options.origin === 'function' ? this.options.origin() : this.options.origin) ?? { x: 0.5, y: 1 }; }

  private bindAsset(assetId: string | undefined): void {
    if (assetId === this.boundAssetId) return;
    this.binding?.destroy(); this.binding = undefined; this.boundAssetId = assetId;
    if (assetId && this.options.aiRuntime) this.binding = this.options.aiRuntime.bindTexture(this.sprite, assetId, { setInitialTexture: !this.playback });
  }

  private prepareAnimation(): void {
    const state = this.controller.state;
    const animations = typeof this.options.animations === 'function' ? this.options.animations() : this.options.animations;
    const assignment = resolveCharacterAnimation(animations, state.activity, state.facing);
    const assetId = assignment?.assetId ?? this.options.assetId;
    const key = assignment?.key ?? this.options.animation?.(state);
    const runtime = this.options.aiRuntime;
    const selection = key && assetId && runtime ? JSON.stringify([assetId, key]) : undefined;
    // Runtime previews replace registered animations; manifest updates can change a
    // linked state without changing its key. Both must refresh a paused playback.
    const source = assetId ? runtime?.manifest.assets[assetId] : undefined;
    const signature = selection ? JSON.stringify([source, this.playback?.assetId ? runtime?.manifest.assets[this.playback.assetId] : undefined, runtime?.manifest.targets, this.playback?.assetId ? runtime?.key(this.playback.assetId) : undefined]) : undefined;
    const registered = this.playback?.animationKey ? this.scene.anims.get(this.playback.animationKey) : undefined;
    if (selection !== this.animationSelection || signature !== this.playbackSignature || registered !== this.registeredAnimation) {
      this.playback?.destroy(); this.playback = undefined;
      this.animationSelection = selection;
      this.sprite.anims.stop();
      if (selection && runtime && assetId) {
        this.playback = runtime.playAnimation(this.sprite, assetId, key, { applyFrameTransforms: false, forceRestart: true });
        const authored = this.playback.animation;
        const asset = runtime.manifest.assets[this.playback.assetId];
        if (authored && asset) {
          const textureKey = runtime.key(this.playback.assetId);
          const definition = JSON.stringify([textureKey, authored]);
          const animation = this.scene.anims.get(authored.key);
          if (!animation || registeredDefinitions.get(animation) !== definition) {
            this.scene.anims.remove(authored.key);
            createAiAnimations(this.scene, runtime.manifest, this.playback.assetId, { asset: { ...asset, animations: [authored] }, textureKey, onFrameTransforms: 'ignore' });
            const created = this.scene.anims.get(authored.key);
            if (created) registeredDefinitions.set(created, definition);
            this.sprite.play(authored.key, false);
          }
        }
        this.sprite.anims.pause();
      }
      this.bindAsset(this.playback?.assetId ?? this.options.assetId);
      this.registeredAnimation = this.playback?.animationKey ? this.scene.anims.get(this.playback.animationKey) : undefined;
      this.playbackSignature = selection ? JSON.stringify([source, this.playback?.assetId ? runtime?.manifest.assets[this.playback.assetId] : undefined, runtime?.manifest.targets, this.playback?.assetId ? runtime?.key(this.playback.assetId) : undefined]) : undefined;
    }
    if (!assignment && this.selectedAssignment) this.sprite.setFlipX(false);
    this.selectedAssignment = assignment;
    const animation = assignment ? this.playback?.animation : undefined;
    if (animation?.frames.length) {
      const durations = animation.frames.map((_frame, index) => animation.frameTimings?.[index]?.delayMs ?? 1000 / animation.frameRate);
      const timingSignature = JSON.stringify(durations);
      if (timingSignature !== this.timingSignature || this.controller.config.frameCount !== durations.length || this.controller.config.frameDurationMs !== durations[0]) {
        this.controller.setAnimationTiming(durations);
        this.timingSignature = timingSignature;
      }
      this.usingAuthoredTiming = true;
    } else this.restoreTiming();
  }

  private restoreTiming(): void {
    if (!this.usingAuthoredTiming) return;
    this.controller.setAnimationTiming(null);
    Object.assign(this.controller.config, this.fallbackTiming);
    this.usingAuthoredTiming = false; this.timingSignature = undefined;
  }
}
