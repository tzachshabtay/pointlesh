import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { PhaserAdventureIcon } from './asset-icon.js';

export type AdventureCursorOptions = {
  assetId: string;
  /** Optional fixed square fit box in CSS pixels. Omit to follow the base asset's dimensions. */
  size?: number;
  pixelArt?: boolean;
  /** Return an asset only over game surfaces; leave designer/browser controls native. */
  resolve(target: Element): string | undefined;
  enabled?: () => boolean;
  /** Position of the click within the icon, normalized from 0 to 1. */
  hotspot?: { x: number; y: number };
};

/** Animated cursor in screen coordinates; never participates in hit testing or room zoom. */
export class PhaserAdventureCursor {
  readonly icon: PhaserAdventureIcon;
  private x = -100;
  private y = -100;
  private touch = false;
  private styled?: HTMLElement;
  private priorCursor = '';
  private destroyed = false;
  constructor(private scene: Phaser.Scene, runtime: AiAssetRuntime, private options: AdventureCursorOptions) {
    this.icon = new PhaserAdventureIcon(scene, runtime, { assetId: options.assetId, width: options.size, height: options.size, pixelArt: options.pixelArt });
    this.icon.canvas.classList.add('pointlesh-adventure-cursor');
    Object.assign(this.icon.canvas.style, { position: 'fixed', zIndex: '1000', left: '0', top: '0' });
    this.icon.canvas.hidden = true;
    const document = scene.game.canvas.ownerDocument, window = document.defaultView!;
    document.body.append(this.icon.canvas);
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('pointerdown', this.move, true);
    window.addEventListener('blur', this.hide);
    document.addEventListener('pointerleave', this.hide);
    scene.events.on('postupdate', this.update);
    scene.events.once('shutdown', this.destroy);
  }
  private move = (event: PointerEvent) => {
    this.x = event.clientX; this.y = event.clientY; this.touch = event.pointerType === 'touch'; this.update();
  };
  private restoreCursor() {
    if (this.styled) this.styled.style.cursor = this.priorCursor;
    this.styled = undefined;
  }
  private hide = () => { this.x = -100; this.restoreCursor(); this.icon.canvas.hidden = true; };
  private update = () => {
    if (this.destroyed) return;
    const target = this.icon.canvas.ownerDocument.elementFromPoint(this.x, this.y);
    const assetId = target ? this.options.resolve(target) : undefined;
    const enabled = this.options.enabled?.() ?? true;
    if (assetId && enabled && !this.icon.playing) this.icon.setAsset(assetId);
    const visible = !!assetId && (enabled || this.icon.playing) && (!this.touch || this.icon.playing);
    this.icon.canvas.hidden = !visible;
    this.restoreCursor();
    if (!visible) return;
    if (target instanceof HTMLElement) { this.styled = target; this.priorCursor = target.style.cursor; target.style.cursor = 'none'; }
    const hotspot = this.options.hotspot ?? { x: .5, y: .5 };
    this.icon.canvas.style.transform = `translate(${Math.round(this.x - this.icon.displayWidth * hotspot.x)}px, ${Math.round(this.y - this.icon.displayHeight * hotspot.y)}px)`;
  };
  /** Snapshot the selected asset so consuming an item cannot replace its click animation. */
  click(assetId?: string): void { this.update(); if (assetId) this.icon.setAsset(assetId); this.icon.play('click'); this.update(); }
  refresh(): void { this.icon.refresh(); this.update(); }
  destroy = () => {
    if (this.destroyed) return;
    this.destroyed = true; this.restoreCursor();
    const document = this.scene.game.canvas.ownerDocument, window = document.defaultView!;
    window.removeEventListener('pointermove', this.move, true); window.removeEventListener('pointerdown', this.move, true);
    window.removeEventListener('blur', this.hide); document.removeEventListener('pointerleave', this.hide);
    this.scene.events.off('postupdate', this.update); this.scene.events.off('shutdown', this.destroy); this.icon.destroy();
  };
}
