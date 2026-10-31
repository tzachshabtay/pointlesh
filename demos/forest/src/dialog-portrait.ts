import type Phaser from 'phaser';
import { AiPortraitLipSync, type AiAssetRuntime } from '@ai-game-assets/phaser';
import type { AiAssetDefinition } from '@ai-game-assets/core';
import type { PointleshProperties } from '@pointlesh/core';
import { PhaserAdventureIcon, adventureLipSyncClock } from '@pointlesh/phaser';

/** The forest demo's portrait presentation; asset playback belongs to Pointlesh. */
export class ForestDialogPortrait {
  icon?: PhaserAdventureIcon;
  private lipSync: AiPortraitLipSync;
  private usingLipSync = false;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime,
    private host: HTMLElement, private paused: () => boolean) {
    scene.events.once('shutdown', this.destroy);
    this.lipSync = new AiPortraitLipSync({ manifest: () => runtime.manifest, paused, size: 192,
      resolveAssetUrl: file => new URL(file, new URL(import.meta.env.BASE_URL, location.href)).href });
  }
  show(properties: PointleshProperties, speaking: boolean): void {
    const id = typeof properties.portraitAssetId === 'string' ? properties.portraitAssetId : '';
    const asset = this.runtime.manifest.assets[id];
    if (!asset || !['image', 'animation', 'spritesheet'].includes(asset.kind)) { this.hide(); return; }
    this.usingLipSync = this.lipSync.show(id);
    if (this.usingLipSync) {
      this.icon?.stop();
      if (this.host.firstChild !== this.lipSync.canvas) this.host.replaceChildren(this.lipSync.canvas);
      if (!speaking) this.lipSync.stop();
      this.host.hidden = false; return;
    }
    this.lipSync.stop();
    if (!this.icon || this.icon.asset !== id) {
      this.icon?.destroy();
      this.icon = new PhaserAdventureIcon(this.scene, this.runtime, { assetId: id, width: 192, height: 192, paused: this.paused });
      this.host.replaceChildren(this.icon.canvas);
    }
    const key = typeof properties.portraitAnimationKey === 'string' ? properties.portraitAnimationKey : 'speak';
    if (this.host.firstChild !== this.icon.canvas) this.host.replaceChildren(this.icon.canvas);
    if (speaking && key) this.icon.play(key, { loop: true });
    else this.icon.stop();
    this.host.hidden = false;
  }
  speak(text: string, line?: AiAssetDefinition, sound?: Phaser.Sound.BaseSound, key: unknown = {}): void {
    if (this.usingLipSync) this.lipSync.speak(key, text, line, sound ? adventureLipSyncClock(sound) : undefined);
  }
  /** Keep promoted/previewed art current without restarting the conversation clock. */
  refresh(): void { this.icon?.refresh(); this.lipSync.refresh(); }
  hide(): void { this.icon?.stop(); this.lipSync.stop(); this.host.hidden = true; }
  destroy = (): void => { this.icon?.destroy(); this.lipSync.destroy(); this.icon = undefined; this.host.replaceChildren(); this.host.hidden = true; };
}
