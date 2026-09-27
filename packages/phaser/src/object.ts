import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { CharacterController, type ResolvedPointleshObject, type ResolvedPointleshArea } from '@pointlesh/core';
import type Phaser from 'phaser';
import { PhaserAdventureCharacter } from './character.js';
import { PhaserObjectLight, type ObjectLightSurface } from './object-light.js';

export type PhaserAdventureObjectOptions = {
  aiRuntime: AiAssetRuntime;
  /** Read fresh resolved prefab properties and placement after designer edits. */
  object: () => ResolvedPointleshObject;
  areas?: () => readonly ResolvedPointleshArea[];
  /** Optional axis-aligned room surface receiving light from this object's prefab properties. */
  lightSurface?: () => ObjectLightSurface | undefined;
  /** Set false when calling update(deltaMs) yourself. */
  autoUpdate?: boolean;
};

/** Ambient object animation, sharing the character renderer's sizing, frame transforms and live previews. */
export class PhaserAdventureObject {
  private renderer?: PhaserAdventureCharacter;
  private assetId?: string;
  private selection?: string;
  private elapsedMs = 0;
  private light?: PhaserObjectLight;
  private destroyed = false;
  private readonly onUpdate = (_time: number, delta: number) => this.update(delta);

  constructor(readonly scene: Phaser.Scene, readonly sprite: Phaser.GameObjects.Sprite, readonly options: PhaserAdventureObjectOptions) {
    if (options.lightSurface) this.light = new PhaserObjectLight(scene, options.lightSurface);
    if (options.autoUpdate !== false) scene.events.on('update', this.onUpdate);
    scene.events.once('shutdown', this.destroy, this);
    sprite.once('destroy', this.destroy, this);
    this.sync();
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Animation delta must be finite and nonnegative.');
    const object = this.options.object();
    this.prepare(object);
    if (object.enabled && object.properties.animationPlaying !== false) this.elapsedMs += deltaMs;
    this.render(object);
  }

  /** Refresh authored properties without restarting the current animation. */
  sync(): void {
    if (this.destroyed) return;
    const object = this.options.object();
    this.prepare(object);
    this.render(object);
  }

  /** Sample a cutscene/save checkpoint without depending on the game's clock. */
  seek(elapsedMs: number): void {
    if (this.destroyed) return;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Animation time must be finite and nonnegative.');
    const object = this.options.object();
    this.prepare(object); this.elapsedMs = elapsedMs;
    this.render(object);
  }

  private prepare(object: ResolvedPointleshObject): void {
    const selection = JSON.stringify([object.assetId, object.properties.animationKey ?? '']);
    if (selection !== this.selection) { this.selection = selection; this.elapsedMs = 0; }
    if (!this.renderer || this.assetId !== object.assetId) {
      this.renderer?.destroy();
      this.assetId = object.assetId;
      const current = this.options.object;
      // The renderer samples an absolute pose; this private controller never walks or ticks.
      this.renderer = new PhaserAdventureCharacter(this.scene,
        new CharacterController({ id: object.id, position: object.position }), this.sprite, {
          autoUpdate: false, aiRuntime: this.options.aiRuntime, assetId: object.assetId,
          animation: () => { const key = current().properties.animationKey; return typeof key === 'string' && key ? key : undefined; },
          baseScale: () => ({ x: current().scaleX, y: current().scaleY }),
          origin: () => ({ x: current().anchorX, y: 1 - current().anchorY }),
          angle: () => current().rotation,
          areas: () => current().properties.ignoreScaling ? [] : this.options.areas?.() ?? [],
        });
    }
  }

  private render(object: ResolvedPointleshObject): void {
    this.renderer?.renderPose({ position: object.position, activity: 'idle', facing: 'down' },
      this.elapsedMs, { loop: object.properties.animationLoop !== false });
    this.light?.sync(object, this.sprite);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('update', this.onUpdate);
    this.scene.events.off('shutdown', this.destroy, this);
    this.sprite.off('destroy', this.destroy, this);
    this.renderer?.destroy();
    this.light?.destroy();
  }
}
