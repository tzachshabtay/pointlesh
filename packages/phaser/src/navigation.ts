import type Phaser from 'phaser';
import type { CharacterController, PointleshProperties, Polygon } from '@pointlesh/core';

export type NavigationFootprint = { width: number; height: number };
export type AdventureNavigationBodyOptions = {
  kind: 'character' | 'object';
  /** Read live prefab/instance properties. walkThrough defaults to false. */
  properties?: () => PointleshProperties;
  /** Ground dimensions in world pixels, centered on the sprite's position. */
  footprint?: NavigationFootprint | (() => NavigationFootprint);
  controller?: CharacterController;
};

/** Occupied ground, not the tall image rectangle: actors can walk behind heads. */
export function defaultNavigationFootprint(width: number, height: number, kind: 'character' | 'object'): NavigationFootprint {
  return { width: Math.abs(width) * (kind === 'character' ? .6 : 1), height: Math.abs(height) * (kind === 'character' ? .1 : .2) };
}

type Sprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
type Body = { sprite: Sprite; options: AdventureNavigationBodyOptions; destroy(): void };

/** Shared live obstacles for click walks, approach, keyboard movement, and restored paths. */
export class PhaserAdventureNavigation {
  private readonly bodies = new Map<Sprite, Body>();
  private destroyed = false;
  private readonly onShutdown = () => this.destroy();

  constructor(readonly scene: Phaser.Scene, readonly walkables: () => readonly Polygon[]) {
    scene.events.once('shutdown', this.onShutdown);
  }

  register(sprite: Sprite, options: AdventureNavigationBodyOptions): { destroy(): void } {
    if (this.destroyed) throw new Error('Navigation world has been destroyed');
    this.bodies.get(sprite)?.destroy();
    const unbind = options.controller?.setNavigationSource(() => ({ walkables: this.walkables(), obstacles: this.obstaclesFor(sprite) }));
    const body: Body = { sprite, options, destroy: () => {
      if (this.bodies.get(sprite) !== body) return;
      this.bodies.delete(sprite);
      sprite.off('destroy', body.destroy);
      unbind?.();
    } };
    this.bodies.set(sprite, body);
    sprite.once('destroy', body.destroy);
    return { destroy: body.destroy };
  }

  private footprint(body: Body): NavigationFootprint {
    const configured = body.options.footprint;
    const size = typeof configured === 'function' ? configured() : configured
      ?? defaultNavigationFootprint(body.sprite.displayWidth, body.sprite.displayHeight, body.options.kind);
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
      throw new Error('Navigation footprints must have positive finite width and height');
    }
    return size;
  }

  /** Expand each blocker by the mover's footprint, so its body also clears corners. */
  obstaclesFor(mover: Sprite): Polygon[] {
    const moving = this.bodies.get(mover);
    const clearance = moving ? this.footprint(moving) : { width: 0, height: 0 };
    const polygons: Polygon[] = [];
    for (const body of this.bodies.values()) {
      if (body.sprite === mover || !body.sprite.scene || !body.sprite.visible || !body.sprite.active) continue;
      const properties = body.options.properties?.();
      if (properties?.enabled === false || properties?.walkThrough === true) continue;
      const size = this.footprint(body);
      const transform = body.sprite.getWorldTransformMatrix();
      const x = transform.tx, y = transform.ty;
      const halfWidth = (size.width + clearance.width) / 2, halfHeight = (size.height + clearance.height) / 2;
      polygons.push([
        { x: x - halfWidth, y: y - halfHeight }, { x: x + halfWidth, y: y - halfHeight },
        { x: x + halfWidth, y: y + halfHeight }, { x: x - halfWidth, y: y + halfHeight },
      ]);
    }
    return polygons;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('shutdown', this.onShutdown);
    for (const body of [...this.bodies.values()]) body.destroy();
  }
}
