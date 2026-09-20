import type Phaser from 'phaser';
import { applyAiAnimationFrameTransform, type AiAssetRuntime, type AiAssetAnimationPlayback, type AiAssetTextureBinding } from '@ai-game-assets/phaser';

export type AdventureIconOptions = {
  assetId: string;
  /** Optional CSS size override. Defaults to the selected base image/frame's size.
   * A single dimension preserves its aspect ratio; both dimensions define a fit box. */
  width?: number;
  height?: number;
  pixelArt?: boolean;
};

/** An AI Assets image/animation rendered into an HTML inventory slot or cursor. */
export class PhaserAdventureIcon {
  readonly canvas: HTMLCanvasElement;
  readonly sprite: Phaser.GameObjects.Sprite;
  private binding?: AiAssetTextureBinding;
  private playback?: AiAssetAnimationPlayback;
  private state?: string;
  private elapsed = 0;
  private assetId: string;
  private destroyed = false;
  private width = 0;
  private height = 0;
  private readonly context: CanvasRenderingContext2D;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime, private options: AdventureIconOptions) {
    this.assetId = options.assetId;
    for (const dimension of [options.width, options.height]) {
      if (dimension !== undefined && (!Number.isFinite(dimension) || dimension <= 0)) throw new Error('Icon dimensions must be positive and finite.');
    }
    this.canvas = scene.game.canvas.ownerDocument.createElement('canvas');
    this.canvas.className = 'pointlesh-asset-icon'; this.canvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.canvas.style, { pointerEvents: 'none', imageRendering: options.pixelArt === false ? 'auto' : 'pixelated' });
    this.context = this.canvas.getContext('2d')!;
    // Kept out of the room display/update lists: its animation clock is UI-owned.
    this.sprite = scene.make.sprite({ key: runtime.key(this.assetId), add: false });
    this.refresh();
    scene.events.on('postupdate', this.update);
    scene.events.once('shutdown', this.destroy);
  }
  get playing(): boolean { return !!this.state; }
  get asset(): string { return this.assetId; }
  get displayWidth(): number { return this.width; }
  get displayHeight(): number { return this.height; }
  setAsset(assetId: string): void {
    if (this.assetId === assetId) return;
    this.assetId = assetId; this.state = undefined; this.elapsed = 0; this.refresh();
  }
  /** Play a linked state once, then return to the base image, even if authored as looping. */
  play(state = 'click'): void { this.state = state; this.elapsed = 0; this.refresh(); }
  /** Call after forwarding AI Assets designer callbacks to the runtime. */
  refresh(): void {
    if (this.destroyed) return;
    this.binding?.destroy(); this.playback?.destroy(); this.playback = undefined;
    this.sprite.anims.stop();
    let source = this.assetId;
    if (this.state) {
      this.playback = this.runtime.playAnimation(this.sprite, this.assetId, this.state, { applyFrameTransforms: false, forceRestart: true });
      source = this.playback.assetId; this.sprite.anims.pause();
      if (!this.playback.animation) this.state = undefined;
    }
    this.binding = this.runtime.bindTexture(this.sprite, this.state ? source : this.assetId);
    this.draw();
  }
  private update = (_time: number, delta: number) => {
    if (this.destroyed) return;
    if (this.state) {
      this.elapsed += Math.max(0, delta);
      const animation = this.playback?.animation;
      const duration = animation?.frames.reduce((sum, _frame, index) => sum + (animation.frameTimings?.[index]?.delayMs ?? 1000 / animation.frameRate), 0) ?? 0;
      if (this.elapsed >= duration) { this.state = undefined; this.elapsed = 0; this.refresh(); }
    }
    this.draw();
  };
  private draw(): void {
    // Read the base texture, including live previews, before variant selection.
    // Click sheets and higher-resolution variants must not change the UI bounds.
    const base = this.scene.textures.getFrame(this.runtime.key(this.assetId));
    this.width = this.options.width ?? (this.options.height === undefined ? base.realWidth : base.realWidth * this.options.height / base.realHeight);
    this.height = this.options.height ?? (this.options.width === undefined ? base.realHeight : base.realHeight * this.options.width / base.realWidth);
    this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
    const ratio = this.canvas.ownerDocument.defaultView?.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(this.width * ratio)) this.canvas.width = Math.round(this.width * ratio);
    if (this.canvas.height !== Math.round(this.height * ratio)) this.canvas.height = Math.round(this.height * ratio);
    const source = this.state ? this.playback!.assetId : this.assetId;
    const animation = this.state ? this.playback?.animation : undefined;
    let slot = 0, remaining = this.elapsed;
    while (animation && slot < animation.frames.length - 1) {
      const duration = animation.frameTimings?.[slot]?.delayMs ?? 1000 / animation.frameRate;
      if (remaining < duration) break;
      remaining -= duration; slot++;
    }
    this.runtime.setTexture(this.sprite, source, animation?.frames[slot]);
    const frame = this.sprite.frame;
    const fit = Math.min(this.width / frame.realWidth, this.height / frame.realHeight);
    applyAiAnimationFrameTransform(this.sprite, animation, slot, { width: frame.realWidth * fit, height: frame.realHeight * fit }, { originX: .5, originY: .5 });
    if (this.runtime.manifest.assets[source]?.activeVersion) this.runtime.applyScaledVariant(this.sprite, source, { width: this.width * ratio, height: this.height * ratio });
    const current = this.sprite.frame, context = this.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, this.width, this.height);
    context.imageSmoothingEnabled = this.options.pixelArt === false;
    context.translate(this.width / 2, this.height / 2); context.rotate(this.sprite.rotation);
    context.scale(this.sprite.scaleX, this.sprite.scaleY);
    context.drawImage(current.source.image as CanvasImageSource, current.cutX, current.cutY, current.cutWidth, current.cutHeight,
      current.x - this.sprite.displayOriginX, current.y - this.sprite.displayOriginY, current.cutWidth, current.cutHeight);
    this.canvas.dataset.assetId = this.assetId;
    this.canvas.dataset.state = this.state ?? 'idle';
    this.canvas.dataset.frame = String(slot);
    this.canvas.dataset.texture = this.sprite.texture.key;
  }
  destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('postupdate', this.update); this.scene.events.off('shutdown', this.destroy);
    this.binding?.destroy(); this.playback?.destroy(); this.sprite.destroy(); this.canvas.remove();
  };
}
