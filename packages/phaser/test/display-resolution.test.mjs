import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installPhaserDisplayResolution } from '../dist/display-resolution.js';

test('device resolution scales canvas draws without changing cameras, pointer space, or offscreen targets', () => {
  let observerCallback, disconnected = false;
  const previous = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() { disconnected = true; } };
  try {
    const view = { devicePixelRatio: 2 }, rect = { width: 590, height: 331.875 };
    const canvas = { width: 960, height: 540, style: { imageRendering: 'pixelated' }, ownerDocument: { defaultView: view }, getBoundingClientRect: () => rect };
    const framebuffer = {}, calls = [];
    const wrapper = { state: {}, update(...args) { calls.push(args); } };
    const original = wrapper.update;
    const renderer = Object.assign(new EventEmitter(), { width: 960, height: 540, glWrapper: wrapper, baseDrawingContext: { state: { bindings: { framebuffer } } }, gl: { MAX_VIEWPORT_DIMS: 1, getParameter: () => [8192, 8192] } });
    const scale = Object.assign(new EventEmitter(), { gameSize: { width: 960, height: 540 } });
    const game = { renderer, canvas, scale, events: new EventEmitter() };
    const handle = installPhaserDisplayResolution(game);
    assert.equal(installPhaserDisplayResolution(game), handle);
    assert.deepEqual([canvas.width, canvas.height], [1180, 664]);
    assert.deepEqual(scale.gameSize, { width: 960, height: 540 });
    const draw = { bindings: { framebuffer }, viewport: [0, 0, 960, 540], scissor: { enable: true, box: [240, 135, 480, 270] } };
    const before = structuredClone(draw);
    wrapper.update(draw);
    assert.deepEqual(calls.at(-1)[0].viewport, [0, 0, 1180, 664]);
    assert.deepEqual(calls.at(-1)[0].scissor.box, [295, 166, 590, 332]);
    assert.deepEqual(draw, before);
    const offscreen = { ...draw, bindings: { framebuffer: {} } };
    wrapper.update(offscreen);
    assert.equal(calls.at(-1)[0], offscreen);
    rect.width = 400; rect.height = 225; observerCallback(); renderer.emit('prerenderclear');
    assert.deepEqual([canvas.width, canvas.height], [800, 450]);
    view.devicePixelRatio = 1; renderer.emit('prerenderclear');
    assert.deepEqual([canvas.width, canvas.height], [400, 225]);
    // Scale-manager resizes must not leave the backing canvas at logical resolution.
    canvas.width = 960; canvas.height = 540; renderer.emit('prerenderclear');
    assert.deepEqual([canvas.width, canvas.height], [400, 225]);
    game.events.emit('destroy'); handle.destroy();
    assert.equal(wrapper.update, original);
    assert.deepEqual([canvas.width, canvas.height], [960, 540]);
    assert.equal(canvas.style.imageRendering, 'pixelated');
    assert.equal(disconnected, true);
    assert.equal(renderer.listenerCount('prerenderclear'), 0);
    assert.equal(scale.listenerCount('resize'), 0);
  } finally { globalThis.ResizeObserver = previous; }
});
