import { EventEmitter } from 'node:events';

export function inputScene() {
  const window = new EventTarget(), document = Object.assign(new EventTarget(), { defaultView: window });
  const properties = new Map();
  const canvas = Object.assign(new EventTarget(), { ownerDocument: document, style: {
    getPropertyValue: key => properties.get(key) ?? '',
    setProperty: (key, value) => properties.set(key, value),
    removeProperty: key => properties.delete(key),
  } });
  return { game: { canvas }, input: new EventEmitter(), events: new EventEmitter() };
}

export function touchEvent(target, type, x = 30, y = 50, count = 1) {
  const touch = { identifier: 7, clientX: x, clientY: y };
  const event = Object.assign(new Event(type), {
    changedTouches: [touch], touches: type === 'touchend' || type === 'touchcancel' ? [] : Array(count).fill(touch),
  });
  target.dispatchEvent(event);
  return event;
}

export function touchDown(scene, x = 30, y = 50) {
  const pointer = { wasTouch: true, isDown: true, identifier: 7, event: touchEvent(scene.game.canvas.ownerDocument.defaultView, 'touchstart', x, y) };
  scene.input.emit('pointerdown', pointer);
  return pointer;
}

export function mouseEvent(target, type, { button = 0, buttons = type === 'mouseup' ? 0 : 1, clientX = 30, clientY = 50 } = {}) {
  const event = Object.assign(new Event(type), { button, buttons, clientX, clientY });
  target.dispatchEvent(event);
  return event;
}

export function mouseDown(scene, options) {
  const event = mouseEvent(scene.game.canvas.ownerDocument.defaultView, 'mousedown', options);
  const pointer = { wasTouch: false, isDown: true, button: event.button, event };
  scene.input.emit('pointerdown', pointer);
  return pointer;
}
