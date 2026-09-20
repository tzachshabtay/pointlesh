import test from 'node:test';
import assert from 'node:assert/strict';
import { bindAdventureInput } from '../dist/pointer-actions.js';
import { inputScene, touchDown, touchEvent, mouseDown, mouseEvent } from './helpers/input.mjs';

function setup(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scene = inputScene(), calls = [];
  const binding = bindAdventureInput(scene, { resolve: () => ({ onInteract: () => calls.push('interact'), onLook: () => calls.push('look') }), ...options });
  t.after(() => binding.destroy());
  return { scene, calls, binding, window: scene.game.canvas.ownerDocument.defaultView };
}

test('left click interacts, right click looks, and other mouse buttons are ignored', t => {
  const { scene, calls, window } = setup(t);
  for (const button of [0, 2, 1, 3, 4]) { mouseDown(scene, { button }); mouseEvent(window, 'mouseup', { button }); }
  assert.deepEqual(calls, ['interact', 'look']);
});

test('mouse hold waits instead of interacting on down and cannot click again on release', t => {
  const { scene, calls, window } = setup(t);
  mouseDown(scene); t.mock.timers.tick(499);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, ['look']);
  mouseEvent(window, 'mouseup'); t.mock.timers.tick(1000);
  assert.deepEqual(calls, ['look']);
  mouseDown(scene); mouseEvent(window, 'mouseup');
  assert.deepEqual(calls, ['look', 'interact']);
});

test('a mouse drag or lost release cannot later interact or look', t => {
  const { scene, calls, window } = setup(t);
  for (const cancel of [
    () => mouseEvent(window, 'mousemove', { clientX: 90 }),
    () => mouseEvent(window, 'mousemove', { buttons: 0 }),
    () => window.dispatchEvent(new Event('blur')),
  ]) {
    mouseDown(scene); cancel(); t.mock.timers.tick(1000); mouseEvent(window, 'mouseup');
  }
  assert.deepEqual(calls, []);
});

test('mouse and touch releases recognize a hold even when the timer has not run', t => {
  const { scene, calls, window } = setup(t);
  for (const kind of ['mouse', 'touch']) {
    const pointer = kind === 'mouse' ? mouseDown(scene) : touchDown(scene);
    const event = Object.assign(new Event(kind === 'mouse' ? 'mouseup' : 'touchend'), {
      button: 0, clientX: 30, clientY: 50,
      changedTouches: [{ identifier: 7, clientX: 30, clientY: 50 }],
    });
    Object.defineProperty(event, 'timeStamp', { value: pointer.event.timeStamp + 700 });
    window.dispatchEvent(event);
  }
  assert.deepEqual(calls, ['look', 'look']);
  t.mock.timers.tick(1000);
  assert.deepEqual(calls, ['look', 'look']);
});

test('tap waits for release, while a hold looks once and never also interacts', t => {
  const { scene, calls, window } = setup(t);
  touchDown(scene); t.mock.timers.tick(499);
  assert.deepEqual(calls, []);
  touchEvent(window, 'touchend');
  assert.deepEqual(calls, ['interact']);
  touchDown(scene); t.mock.timers.tick(500);
  assert.deepEqual(calls, ['interact', 'look']);
  t.mock.timers.tick(1000); touchEvent(window, 'touchend');
  assert.deepEqual(calls, ['interact', 'look']);
});

test('dragging, cancelled touches, multiple fingers and lost focus abandon the gesture', t => {
  const { scene, calls, window } = setup(t);
  for (const cancel of [
    () => { touchEvent(window, 'touchmove', 45); touchEvent(window, 'touchmove', 30); },
    () => touchEvent(window, 'touchcancel'),
    () => touchEvent(window, 'touchstart', 30, 50, 2),
    () => window.dispatchEvent(new Event('blur')),
    () => scene.game.canvas.ownerDocument.dispatchEvent(new Event('visibilitychange')),
    () => scene.events.emit('pause'),
    () => scene.events.emit('sleep'),
  ]) {
    touchDown(scene); cancel(); t.mock.timers.tick(1000); touchEvent(window, 'touchend');
  }
  assert.deepEqual(calls, []);
  // Release coordinates are checked even when a movement event was missed.
  touchDown(scene); touchEvent(window, 'touchend', 100);
  assert.deepEqual(calls, []);
});

test('delayed actions recheck enabled state and resolve their target only once', t => {
  let enabled = true, current = 'original', resolves = 0;
  const actions = [];
  const { scene, window } = setup(t, {
    enabled: () => enabled,
    resolve: () => { resolves++; const target = current; return { onInteract: () => actions.push(target), onLook: () => actions.push(target) }; },
  });
  touchDown(scene); current = 'moved'; t.mock.timers.tick(500);
  assert.deepEqual(actions, ['original']); assert.equal(resolves, 1);
  touchDown(scene); enabled = false; t.mock.timers.tick(500); touchEvent(window, 'touchend');
  enabled = true; touchDown(scene); enabled = false; touchEvent(window, 'touchend');
  scene.input.emit('pointerdown', { button: 2 });
  assert.deepEqual(actions, ['original']);
});

test('configurable hold threshold tolerates a little touch jitter', t => {
  const { scene, window, calls } = setup(t, { longPressMs: 700, dragThreshold: 15 });
  touchDown(scene); touchEvent(window, 'touchmove', 40, 55);
  t.mock.timers.tick(699); assert.deepEqual(calls, []);
  t.mock.timers.tick(1); assert.deepEqual(calls, ['look']);
});

test('context menu suppression is canvas-only, shared and removed after the last binding', t => {
  const { scene, binding } = setup(t);
  const second = bindAdventureInput(scene, { resolve: () => undefined });
  const menu = target => { const event = new Event('contextmenu', { cancelable: true }); target.dispatchEvent(event); return event.defaultPrevented; };
  assert.equal(menu(scene.game.canvas), true);
  assert.equal(menu(scene.game.canvas.ownerDocument.defaultView), false);
  binding.destroy(); assert.equal(menu(scene.game.canvas), true);
  second.destroy(); assert.equal(menu(scene.game.canvas), false);
});

test('shutdown cancels a hold and detaches input', t => {
  const { scene, calls, window } = setup(t);
  touchDown(scene); scene.events.emit('shutdown');
  t.mock.timers.tick(1000); touchEvent(window, 'touchend');
  scene.input.emit('pointerdown', { button: 0 });
  assert.deepEqual(calls, []);
  assert.equal(scene.input.listenerCount('pointerdown'), 0);
});
