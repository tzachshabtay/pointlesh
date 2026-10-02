import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import type { PointleshProperties } from '@pointlesh/core';
import { PhaserAdventureIcon } from '@pointlesh/phaser';

/** The forest demo's portrait presentation; asset playback belongs to Pointlesh. */
export class ForestDialogPortrait {
  icon?: PhaserAdventureIcon;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime,
    private host: HTMLElement, private paused: () => boolean) {
    scene.events.once('shutdown', this.destroy);
  }
  show(properties: PointleshProperties, speaking: boolean): void {
    const id = typeof properties.portraitAssetId === 'string' ? properties.portraitAssetId : '';
    const asset = this.runtime.manifest.assets[id];
    if (!asset || !['image', 'animation', 'spritesheet'].includes(asset.kind)) { this.hide(); return; }
    if (!this.icon || this.icon.asset !== id) {
      this.icon?.destroy();
      this.icon = new PhaserAdventureIcon(this.scene, this.runtime, { assetId: id, width: 192, height: 192, paused: this.paused });
      this.host.replaceChildren(this.icon.canvas);
    }
    const key = typeof properties.portraitAnimationKey === 'string' ? properties.portraitAnimationKey : 'speak';
    if (speaking && key) this.icon.play(key, { loop: true });
    else this.icon.stop();
    this.host.hidden = false;
  }
  /** Keep promoted/previewed art current without restarting the conversation clock. */
  refresh(): void { this.icon?.refresh(); }
  hide(): void { this.icon?.stop(); this.host.hidden = true; }
  destroy = (): void => { this.icon?.destroy(); this.icon = undefined; this.host.replaceChildren(); this.host.hidden = true; };
}
