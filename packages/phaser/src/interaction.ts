import type Phaser from 'phaser';
import { createAdventurePointerHandler, type AdventureGestureOptions, type AdventurePointerActions } from './pointer-actions.js';

export type AdventureSpriteInteractionOptions = AdventureGestureOptions & AdventurePointerActions & {
  alphaTolerance?: number;
  onHover?(hovered: boolean, pointer: Phaser.Input.Pointer): void;
};

/** Native Phaser input, with alpha sampled from the sprite's current frame and mirrored view. */
export function bindAdventureSpriteInteraction(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  options: AdventureSpriteInteractionOptions,
): { destroy(): void } {
  const tolerance = options.alphaTolerance ?? 1;
  if (!Number.isFinite(tolerance) || tolerance < 1 || tolerance > 255) throw new Error('alphaTolerance must be between 1 and 255.');
  const scene = sprite.scene;
  const previous = sprite.input ? {
    enabled: sprite.input.enabled, hitArea: sprite.input.hitArea,
    hitAreaCallback: sprite.input.hitAreaCallback, customHitArea: sprite.input.customHitArea,
  } : undefined;
  const enabled = () => sprite.active && sprite.visible && sprite.alpha > 0 && (options.enabled?.() ?? true);
  const gestures = createAdventurePointerHandler(scene, { ...options, enabled, resolve: () => options });
  const contains: Phaser.Types.Input.HitAreaCallback = (_area, localX, localY) => {
    if (!enabled()) return false;
    // Phaser transforms pointer coordinates for position, scale, rotation and origin,
    // but texture flips are a render transform and must be mirrored explicitly.
    const frame = sprite.frame;
    const flipOriginX = frame.customPivot ? 2 * sprite.displayOriginX : frame.realWidth;
    const flipOriginY = frame.customPivot ? 2 * sprite.displayOriginY : frame.realHeight;
    const x = sprite.flipX ? Math.ceil(flipOriginX - localX) - 1 : Math.floor(localX);
    const y = sprite.flipY ? Math.ceil(flipOriginY - localY) - 1 : Math.floor(localY);
    if (x < 0 || y < 0 || x >= frame.realWidth || y >= frame.realHeight) return false;
    return (scene.textures.getPixelAlpha(x, y, sprite.texture.key, sprite.frame.name) ?? 0) >= tolerance;
  };
  sprite.setInteractive({}, contains);
  // setInteractive only re-enables existing input, so replace its callback explicitly.
  sprite.input!.hitArea = {};
  sprite.input!.hitAreaCallback = contains;
  sprite.input!.customHitArea = true;
  const hover = (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    if (!enabled()) return;
    event.stopPropagation(); options.onHover?.(true, pointer);
  };
  const out = (pointer: Phaser.Input.Pointer) => options.onHover?.(false, pointer);
  const interact = (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    if (!enabled()) return;
    // Consume before invoking callbacks, which may destroy or replace this sprite.
    if (pointer.wasTouch || pointer.button === 0 || pointer.button === 2) event.stopPropagation();
    gestures.down(pointer);
  };
  sprite.on('pointerover', hover);
  sprite.on('pointermove', hover);
  sprite.on('pointerout', out);
  sprite.on('pointerdown', interact);
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    gestures.destroy();
    sprite.off('pointerover', hover); sprite.off('pointermove', hover);
    sprite.off('pointerout', out); sprite.off('pointerdown', interact);
    sprite.off('destroy', destroy); scene.events.off('shutdown', destroy);
    if (sprite.input && sprite.input.hitAreaCallback === contains) {
      if (previous) Object.assign(sprite.input, previous);
      else sprite.removeInteractive();
    }
  };
  sprite.once('destroy', destroy); scene.events.once('shutdown', destroy);
  return { destroy };
}
