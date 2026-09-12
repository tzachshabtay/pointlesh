import Phaser from 'phaser';

/** Paint editor graphics above HTML game UI without moving or covering the game canvas. */
export function installPhaserDesignerLayer(scene: Phaser.Scene, drawings: Phaser.GameObjects.GameObject[], isOpen: () => boolean) {
  const source = scene.game.canvas, document = source.ownerDocument, window = document.defaultView!;
  const canvas = document.createElement('canvas');
  canvas.className = 'pointlesh-designer-layer';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147482999', background: 'transparent' });
  document.body.append(canvas);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  // A second renderer shares the game's existing drawing objects and camera
  // geometry. It has no game loop, input manager, textures or simulation of its own.
  const events = new Phaser.Events.EventEmitter(), textures = new Phaser.Events.EventEmitter();
  const renderer = new Phaser.Renderer.Canvas.CanvasRenderer({
    config: { ...scene.game.config, context, transparent: true }, canvas, events, textures,
    scene: { customViewports: true },
  } as unknown as Phaser.Game);
  const renderScene = { sys: { context } } as unknown as Phaser.Scene;
  const camera = new Phaser.Cameras.Scene2D.Camera(0, 0, source.width, source.height);
  const filters = new Map(drawings.map(object => [object, object.cameraFilter]));
  let destroyed = false;
  function render() {
    if (destroyed) return;
    const rect = source.getBoundingClientRect();
    let left = rect.left, top = rect.top, width = rect.width, height = rect.height;
    if (window.getComputedStyle(source).objectFit === 'contain') {
      const scale = Math.min(width / source.width, height / source.height);
      left += (width - source.width * scale) / 2; top += (height - source.height * scale) / 2;
      width = source.width * scale; height = source.height * scale;
    }
    Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    if (canvas.width !== source.width) canvas.width = source.width;
    if (canvas.height !== source.height) canvas.height = source.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = !isOpen();
    if (canvas.hidden) return;
    const view = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { rotation: number };
    camera.setViewport(view.x, view.y, view.width, view.height).setScroll(view.scrollX, view.scrollY)
      .setZoom(view.zoomX, view.zoomY).setRotation(view.rotation).setOrigin(view.originX, view.originY);
    camera.alpha = view.alpha;
    camera.preRender();
    renderer.render(renderScene, drawings.filter(object => object.scene && (object as Phaser.GameObjects.Graphics).visible)
      .sort((a, b) => (a as Phaser.GameObjects.Graphics).depth - (b as Phaser.GameObjects.Graphics).depth), camera);
  }
  const excludeFromGame = () => {
    for (const object of drawings) for (const view of scene.cameras.cameras) object.cameraFilter |= view.id;
  };
  excludeFromGame();
  // Transparent pixels pass through to game controls. Painted editor pixels
  // retain input priority and use the native canvas editor's existing gestures.
  const forward = (event: Event) => {
    if (canvas.hidden || event.target === source) return;
    const touch = typeof TouchEvent !== 'undefined' && event instanceof TouchEvent;
    const point = touch ? event.changedTouches[0] : event instanceof MouseEvent ? event : undefined;
    if (!point) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((point.clientX - rect.left) * canvas.width / rect.width);
    const y = Math.floor((point.clientY - rect.top) * canvas.height / rect.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || !context.getImageData(x, y, 1, 1).data[3]) return;
    canvas.style.pointerEvents = 'auto';
    const top = document.elementFromPoint(point.clientX, point.clientY);
    canvas.style.pointerEvents = 'none';
    if (top !== canvas) return; // Floating designer panels keep priority.
    const clone = touch ? new TouchEvent(event.type, { bubbles: event.bubbles, cancelable: event.cancelable,
      touches: Array.from(event.touches), targetTouches: Array.from(event.targetTouches), changedTouches: Array.from(event.changedTouches),
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey }) : event instanceof WheelEvent ? new WheelEvent(event.type, event)
      : event instanceof PointerEvent ? new PointerEvent(event.type, event) : new MouseEvent(event.type, event as MouseEvent);
    event.stopImmediatePropagation();
    const accepted = source.dispatchEvent(clone);
    // Preserve compatibility mouse events for the native Phaser editor. A
    // baseline grip cancels pointerdown itself and already owns that gesture.
    if (!(event instanceof PointerEvent) || !accepted) event.preventDefault();
  };
  const eventNames = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'];
  for (const name of eventNames) window.addEventListener(name, forward, { capture: true, passive: false });
  scene.game.events.on('prerender', excludeFromGame);
  scene.game.events.on('postrender', render);
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.game.events.off('prerender', excludeFromGame); scene.game.events.off('postrender', render);
    for (const name of eventNames) window.removeEventListener(name, forward, true);
    for (const [object, filter] of filters) if (object.scene) object.cameraFilter = filter;
    renderer.destroy(); camera.destroy(); events.removeAllListeners(); textures.removeAllListeners(); canvas.remove();
  };
  render();
  return { canvas, destroy };
}
