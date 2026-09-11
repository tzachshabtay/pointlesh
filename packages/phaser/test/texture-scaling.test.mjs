import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installPhaserTextureScaling, setTextureScaling } from '../dist/texture-scaling.js';

const texture = key => ({ key, smoothPixelArt: true, mode: 0,
  setSmoothPixelArt(value) { this.smoothPixelArt = value; },
  setFilter(value) { this.mode = value; },
});

test('game filtering covers loaded sprites, room overrides, future AI previews and cleanup', () => {
  const actor = texture('actor'), room = texture('room.pub');
  const textures = Object.assign(new EventEmitter(), { list: { actor, room } });
  const events = new EventEmitter();
  const canvas = { style: { imageRendering: 'auto' } };
  const installation = installPhaserTextureScaling({ textures, events, game: { canvas } }, {
    default: 'nearest', canvas: 'pixelated',
    resolve: entry => entry.key.startsWith('room.') ? 'smooth-pixel-art' : undefined,
  });
  assert.equal(actor.mode, 1);
  assert.equal(actor.smoothPixelArt, false);
  assert.equal(room.mode, 0);
  assert.equal(room.smoothPixelArt, true);
  const preview = texture('ai.preview.actor.walk');
  textures.emit('addtexture', preview.key, preview);
  assert.equal(preview.mode, 1);
  assert.equal(preview.smoothPixelArt, false);
  assert.equal(canvas.style.imageRendering, 'pixelated');
  events.emit('shutdown');
  installation.destroy();
  assert.equal(textures.listenerCount('addtexture'), 0);
  assert.equal(events.listenerCount('shutdown'), 0);
  assert.equal(canvas.style.imageRendering, 'auto');
});

test('games can switch a texture from smooth pixel art to linear or nearest', () => {
  const art = texture('portrait');
  setTextureScaling(art, 'smooth-pixel-art');
  setTextureScaling(art, 'linear');
  assert.equal(art.mode, 0);
  assert.equal(art.smoothPixelArt, false);
  setTextureScaling(art, 'nearest');
  assert.equal(art.mode, 1);
  assert.equal(art.smoothPixelArt, false);
});
