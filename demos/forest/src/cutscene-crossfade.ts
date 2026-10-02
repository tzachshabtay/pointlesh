import type Phaser from 'phaser';

export const CUTSCENE_CROSSFADE_MS = 700;

/** Dissolve the fully rendered shot, including its lighting, as one image. */
export class CutsceneCrossfade {
  private image?: HTMLImageElement;
  private animations: Animation[] = [];
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once('shutdown', this.destroy, this);
  }

  start(host: HTMLElement, portrait: HTMLElement, revealGame: () => void, complete: () => void): void {
    // Snapshot after rendering, before disposing the private cinematic camera.
    // Reading a WebGL canvas between frames can instead return a cleared buffer.
    this.scene.game.renderer.snapshot(image => {
      if (this.destroyed) return;
      if (!(image instanceof HTMLImageElement)) { revealGame(); this.destroy(); complete(); return; }
      this.image = image;
      image.className = 'cutscene-crossfade';
      image.setAttribute('aria-hidden', 'true'); image.draggable = false;
      host.append(image);
      revealGame();
      const options = { duration: CUTSCENE_CROSSFADE_MS, easing: 'ease-in-out', fill: 'forwards' as const };
      this.animations = [image.animate([{ opacity: 1 }, { opacity: 0 }], options)];
      if (!portrait.hidden) this.animations.push(portrait.animate([{ opacity: 1 }, { opacity: 0 }], options));
      void this.animations[0]!.finished.then(() => {
        if (this.destroyed) return;
        this.destroy(); complete();
      }, () => { /* A new game, load or shutdown cancelled this presentation. */ });
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('shutdown', this.destroy, this);
    for (const animation of this.animations) animation.cancel();
    this.image?.remove();
  }
}
