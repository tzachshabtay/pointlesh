import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { PhaserAdventureIcon } from './asset-icon.js';

export type AdventureCursorAppearance = {
  assetId: string;
  /** Normalized coordinates from the displayed icon's top-left. */
  hotspot?: { x: number; y: number };
  crosshair?: { assetId: string; animation?: string; size?: number };
};
export type AdventureCursorOptions = {
  assetId: string;
  /** Optional fixed square fit box in CSS pixels. Omit to follow the base asset's dimensions. */
  size?: number;
  pixelArt?: boolean;
  /** Return an asset only over game surfaces; leave designer/browser controls native. */
  resolve(target: Element): string | AdventureCursorAppearance | undefined;
  enabled?: () => boolean;
  /** Position of the click within the icon, normalized from 0 to 1. */
  hotspot?: { x: number; y: number };
};

/** Animated cursor in screen coordinates; never participates in hit testing or room zoom. */
export class PhaserAdventureCursor {
  readonly icon: PhaserAdventureIcon;
  private crosshair?: PhaserAdventureIcon;
  private crosshairKey = '';
  private appearance: AdventureCursorAppearance;
  private x = -100;
  private y = -100;
  private touch = false;
  private nativeCursorStyle: HTMLStyleElement;
  private retainClickAsset = false;
  private destroyed = false;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime, private options: AdventureCursorOptions) {
    this.appearance = { assetId: options.assetId };
    this.icon = new PhaserAdventureIcon(scene, runtime, { assetId: options.assetId, width: options.size, height: options.size, pixelArt: options.pixelArt, idleAnimation: 'idle' });
    this.icon.canvas.classList.add('pointlesh-adventure-cursor');
    Object.assign(this.icon.canvas.style, { position: 'fixed', zIndex: '1000', left: '0', top: '0' });
    this.icon.canvas.hidden = true;
    const document = scene.game.canvas.ownerDocument, window = document.defaultView!;
    // Hide the native cursor across element boundaries before the next pointer event.
    // A per-target inline style can flash the next button's cursor before JS runs.
    this.nativeCursorStyle = document.createElement('style');
    this.nativeCursorStyle.textContent = ':root, :root * { cursor: none !important; }';
    this.nativeCursorStyle.media = 'not all';
    document.head.append(this.nativeCursorStyle);
    document.body.append(this.icon.canvas);
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('pointerdown', this.move, true);
    window.addEventListener('blur', this.hide);
    document.addEventListener('pointerleave', this.hide);
    scene.events.on('postupdate', this.update);
    scene.events.once('shutdown', this.destroy);
  }
  private move = (event: PointerEvent) => {
    if (event.clientX !== this.x || event.clientY !== this.y) this.retainClickAsset = false;
    this.x = event.clientX; this.y = event.clientY; this.touch = event.pointerType === 'touch'; this.update();
  };
  private setVisible(visible: boolean) {
    this.icon.canvas.hidden = !visible;
    if (this.crosshair) this.crosshair.canvas.hidden = !visible || !this.appearance.crosshair;
    const media = visible ? 'all' : 'not all';
    if (this.nativeCursorStyle.media !== media) this.nativeCursorStyle.media = media;
  }
  private hide = () => { this.x = -100; this.setVisible(false); };
  private setAppearance(value: string | AdventureCursorAppearance) {
    this.appearance = typeof value === 'string' ? { assetId: value } : value;
    this.icon.setAsset(this.appearance.assetId);
    const config = this.appearance.crosshair;
    const key = config ? JSON.stringify(config) : '';
    if (key !== this.crosshairKey) {
      this.crosshair?.destroy(); this.crosshair = undefined; this.crosshairKey = key;
      if (config) {
        this.crosshair = new PhaserAdventureIcon(this.scene, this.runtime, {
          assetId: config.assetId, width: config.size, height: config.size,
          pixelArt: this.options.pixelArt, idleAnimation: config.animation ?? 'idle',
        });
        this.crosshair.canvas.classList.add('pointlesh-adventure-crosshair');
        Object.assign(this.crosshair.canvas.style, { position: 'fixed', zIndex: '1001', left: '0', top: '0' });
        this.icon.canvas.ownerDocument.body.append(this.crosshair.canvas);
      }
    }
  }
  private update = () => {
    if (this.destroyed) return;
    const target = this.icon.canvas.ownerDocument.elementFromPoint(this.x, this.y);
    const appearance = target ? this.options.resolve(target) : undefined;
    const enabled = this.options.enabled?.() ?? true;
    // A new hover action takes priority over feedback for the previous action.
    // Explicit click assets stay visible through inventory consumption until the pointer moves.
    if (appearance && enabled && (!this.icon.feedbackPlaying || !this.retainClickAsset)) this.setAppearance(appearance);
    const visible = !!appearance && (enabled || this.icon.feedbackPlaying) && (!this.touch || this.icon.feedbackPlaying);
    this.setVisible(visible);
    if (!visible) return;
    const hotspot = this.appearance.hotspot ?? this.options.hotspot ?? { x: .5, y: .5 };
    const offset = this.icon.pointOffset(hotspot);
    this.icon.canvas.style.transform = `translate(${Math.round(this.x - offset.x)}px, ${Math.round(this.y - offset.y)}px)`;
    if (this.crosshair) this.crosshair.canvas.style.transform = `translate(${Math.round(this.x - this.crosshair.displayWidth / 2)}px, ${Math.round(this.y - this.crosshair.displayHeight / 2)}px)`;
  };
  /** An explicit asset keeps its click feedback through state changes until the pointer moves. */
  click(appearance?: string | AdventureCursorAppearance): void {
    this.retainClickAsset = false;
    this.update();
    if (appearance) this.setAppearance(appearance);
    this.retainClickAsset = !!appearance;
    this.icon.play('click'); this.update();
  }
  refresh(): void { this.icon.refresh(); this.crosshair?.refresh(); this.update(); }
  destroy = () => {
    if (this.destroyed) return;
    this.destroyed = true; this.nativeCursorStyle.remove();
    const document = this.scene.game.canvas.ownerDocument, window = document.defaultView!;
    window.removeEventListener('pointermove', this.move, true); window.removeEventListener('pointerdown', this.move, true);
    window.removeEventListener('blur', this.hide); document.removeEventListener('pointerleave', this.hide);
    this.scene.events.off('postupdate', this.update); this.scene.events.off('shutdown', this.destroy); this.icon.destroy(); this.crosshair?.destroy();
  };
}
