import type Phaser from 'phaser';

export type AdventurePointerActions = {
  onInteract(pointer: Phaser.Input.Pointer): void;
  onLook?(pointer: Phaser.Input.Pointer): void;
};

export type AdventureGestureOptions = {
  /** Read current game/editor state, including again before a delayed press action. */
  enabled?: () => boolean;
  /** Hold duration for look, in milliseconds. Defaults to 500. */
  longPressMs?: number;
  /** Maximum press movement in CSS pixels before cancelling. Defaults to 10. */
  dragThreshold?: number;
};

export type AdventureInputOptions = AdventureGestureOptions & {
  /** Resolve once at press time, so a moving camera/actor cannot change the target. */
  resolve(pointer: Phaser.Input.Pointer): AdventurePointerActions | undefined;
};

const canvasBindings = new WeakMap<HTMLCanvasElement, { count: number; restore(): void }>();
function suppressContextMenu(canvas: HTMLCanvasElement): () => void {
  let binding = canvasBindings.get(canvas);
  if (!binding) {
    const prevent = (event: Event) => event.preventDefault();
    const callout = canvas.style.getPropertyValue('-webkit-touch-callout');
    canvas.style.setProperty('-webkit-touch-callout', 'none');
    canvas.addEventListener('contextmenu', prevent);
    binding = { count: 0, restore() {
      canvas.removeEventListener('contextmenu', prevent);
      if (callout) canvas.style.setProperty('-webkit-touch-callout', callout);
      else canvas.style.removeProperty('-webkit-touch-callout');
      canvasBindings.delete(canvas);
    } };
    canvasBindings.set(canvas, binding);
  }
  binding.count++;
  return () => { if (--binding.count === 0) binding.restore(); };
}

/** Shared implementation for alpha-tested sprites and scene/background input. */
export function createAdventurePointerHandler(scene: Phaser.Scene, options: AdventureInputOptions) {
  const duration = options.longPressMs ?? 500, threshold = options.dragThreshold ?? 10;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('longPressMs must be positive.');
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('dragThreshold must be nonnegative.');
  const canvas = scene.game.canvas, document = canvas.ownerDocument, window = document.defaultView!;
  const restoreMenu = suppressContextMenu(canvas);
  let destroyed = false;
  let pending: {
    pointer: Phaser.Input.Pointer; actions: AdventurePointerActions;
    x: number; y: number; identifier?: number; startedAt: number; timer: ReturnType<typeof setTimeout>;
  } | undefined;
  const enabled = () => !destroyed && (options.enabled?.() ?? true);
  const cancel = () => {
    if (pending) clearTimeout(pending.timer);
    pending = undefined;
    window.removeEventListener('touchstart', extraTouch, true);
    window.removeEventListener('touchmove', move, true);
    window.removeEventListener('touchend', release, true);
    window.removeEventListener('touchcancel', cancel, true);
    window.removeEventListener('mousemove', mouseMove, true);
    window.removeEventListener('mouseup', mouseRelease, true);
    window.removeEventListener('mousedown', cancel, true);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', cancel);
  };
  const extraTouch = (event: TouchEvent) => { if (event.touches.length > 1) cancel(); };
  const moved = (position: { clientX: number; clientY: number }) => !!pending && Math.hypot(position.clientX - pending.x, position.clientY - pending.y) > threshold;
  const move = (event: TouchEvent) => {
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === pending?.identifier);
    if (touch && moved(touch)) cancel();
  };
  const finish = (position: { clientX: number; clientY: number }, timeStamp: number) => {
    if (!pending) return;
    const { pointer, actions, startedAt } = pending;
    const valid = enabled() && !moved(position);
    // A busy event loop can deliver release before the timeout callback. Use the
    // event timestamps too, so a completed hold can never become an interaction.
    const action = timeStamp - startedAt >= duration && actions.onLook ? actions.onLook : actions.onInteract;
    cancel();
    if (valid) action(pointer);
  };
  const release = (event: TouchEvent) => {
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === pending?.identifier);
    if (touch) finish(touch, event.timeStamp);
  };
  const mouseMove = (event: MouseEvent) => {
    if (pending?.identifier === undefined && (!(event.buttons & 1) || moved(event))) cancel();
  };
  const mouseRelease = (event: MouseEvent) => {
    if (pending?.identifier === undefined && event.button === 0) finish(event, event.timeStamp);
  };
  const down = (pointer: Phaser.Input.Pointer): boolean => {
    if (!enabled() || (!pointer.wasTouch && pointer.button !== 0 && pointer.button !== 2)) return false;
    const actions = options.resolve(pointer);
    if (!actions) return false;
    cancel();
    if (!pointer.wasTouch && pointer.button === 2) {
      actions.onLook?.(pointer);
      return true;
    }
    const event = pointer.event;
    const position = pointer.wasTouch
      ? Array.from((event as TouchEvent).changedTouches).find(touch => touch.identifier === pointer.identifier)
      : event as MouseEvent;
    if (!position || pointer.wasTouch && (event as TouchEvent).touches.length !== 1) return true;
    pending = { pointer, actions, x: position.clientX, y: position.clientY,
      identifier: pointer.wasTouch ? pointer.identifier : undefined, startedAt: event.timeStamp,
      timer: setTimeout(() => {
        if (!pending || !actions.onLook) return;
        const valid = enabled() && pointer.isDown && !pointer.wasCanceled;
        cancel();
        if (valid) actions.onLook(pointer);
      }, duration),
    };
    // Native capture listeners still see releases/movement swallowed by a sprite,
    // a designer overlay, or a release outside the canvas.
    window.addEventListener('touchstart', extraTouch, true);
    window.addEventListener('touchmove', move, true);
    window.addEventListener('touchend', release, true);
    window.addEventListener('touchcancel', cancel, true);
    window.addEventListener('mousemove', mouseMove, true);
    window.addEventListener('mouseup', mouseRelease, true);
    window.addEventListener('mousedown', cancel, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return true;
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; cancel(); restoreMenu();
    scene.events.off('pause', cancel); scene.events.off('sleep', cancel);
    scene.events.off('shutdown', destroy);
  };
  scene.events.on('pause', cancel); scene.events.on('sleep', cancel);
  scene.events.once('shutdown', destroy);
  return { down, cancel, destroy };
}

/** Click/tap on release interacts; right click or a hold looks. Sprite handlers take priority. */
export function bindAdventureInput(scene: Phaser.Scene, options: AdventureInputOptions): { cancel(): void; destroy(): void } {
  const handler = createAdventurePointerHandler(scene, options);
  scene.input.on('pointerdown', handler.down);
  const destroy = () => {
    scene.input.off('pointerdown', handler.down);
    scene.events.off('shutdown', destroy);
    handler.destroy();
  };
  scene.events.once('shutdown', destroy);
  return { cancel: handler.cancel, destroy };
}
