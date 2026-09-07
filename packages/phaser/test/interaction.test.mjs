import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { bindAdventureSpriteInteraction } from '../dist/interaction.js';

function actor() {
  const sprite = Object.assign(new EventEmitter(), {
    active: true, visible: true, alpha: 1, width: 4, height: 3,
    displayOriginX: 1, displayOriginY: 1,
    flipX: false, flipY: false, texture: { key: 'actor' },
    frame: { name: 'right-pixel', realWidth: 4, realHeight: 3, customPivot: false },
    scene: {
      events: new EventEmitter(),
      textures: { getPixelAlpha(x, y, _texture, frame) { return y === 1 && x === (frame === 'right-pixel' ? 3 : 0) ? 255 : 0; } },
    },
    setInteractive(hitArea, hitAreaCallback) { this.input ??= { enabled: true, hitArea, hitAreaCallback, customHitArea: true }; return this; },
    removeInteractive() { this.input = undefined; },
  });
  return sprite;
}

test('sprite alpha input follows frame replacement and mirrored view without a cached rectangle', () => {
  const sprite = actor();
  bindAdventureSpriteInteraction(sprite, { onInteract() {} });
  const hit = (x, y) => sprite.input.hitAreaCallback(sprite.input.hitArea, x, y, sprite);
  assert.equal(hit(.5, 1.5), false);
  assert.equal(hit(3.5, 1.5), true);
  sprite.flipX = true;
  assert.equal(hit(.5, 1.5), true);
  assert.equal(hit(3.5, 1.5), false);
  sprite.frame = { ...sprite.frame, name: 'left-pixel' };
  assert.equal(hit(.5, 1.5), false);
  assert.equal(hit(3.5, 1.5), true);
});

test('a flipped atlas custom pivot can place visible pixels outside the unflipped bounds', () => {
  const sprite = actor();
  sprite.frame.customPivot = true; sprite.flipX = true;
  bindAdventureSpriteInteraction(sprite, { onInteract() {} });
  const hit = (x, y) => sprite.input.hitAreaCallback(sprite.input.hitArea, x, y, sprite);
  assert.equal(hit(-1.5, 1.5), true, 'The opaque pixel mirrors around the off-center authored pivot');
  assert.equal(hit(.5, 1.5), false, 'The ordinary full-frame mirror location is transparent');
  assert.equal(hit(-2.5, 1.5), false);
});

test('sprite interaction gates input, consumes clicks, and restores existing input on detach', () => {
  const sprite = actor();
  const priorHit = () => true;
  sprite.input = { enabled: false, hitArea: { width: 4 }, hitAreaCallback: priorHit, customHitArea: false };
  let enabled = false, interactions = 0, stopped = 0;
  const binding = bindAdventureSpriteInteraction(sprite, { enabled: () => enabled, onInteract: () => interactions++ });
  const click = () => sprite.emit('pointerdown', { button: 0 }, 3.5, 1.5, { stopPropagation() { stopped++; } });
  click(); assert.equal(interactions, 0);
  enabled = true; click(); assert.equal(interactions, 1); assert.equal(stopped, 1);
  binding.destroy();
  assert.equal(sprite.input.hitAreaCallback, priorHit); assert.equal(sprite.input.enabled, false);
  click(); assert.equal(interactions, 1);
});
