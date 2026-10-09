export interface DesignerViewportOptions {
  /** Presentation container; its authored world coordinates are never resized. */
  target: HTMLElement;
  aspectRatio?: number;
  /** Space occupied by game controls outside the canvas. */
  chromeHeight?: () => number;
  onResize?: () => void;
}

/** Keep the view usable even if a floating panel is dragged to the left edge. */
export function designerViewportBounds(view: { x: number; y: number; width: number; height: number }, panel: { left: number; bottom: number }) {
  const x = view.x + 12;
  const y = view.y + 64;
  const availableWidth = Math.max(1, view.width - 24);
  const leftWidth = panel.left - x - 12;
  if (leftWidth < 160 && view.y + view.height - panel.bottom - 52 >= 180) {
    return { x, y: panel.bottom + 40, width: availableWidth, height: view.y + view.height - panel.bottom - 52 };
  }
  return { x, y, width: Math.min(availableWidth, Math.max(Math.min(160, availableWidth), leftWidth)), height: Math.max(1, view.height - 76) };
}

/** Fit a live game beside the shared designer dock, with manual resize handles. */
export function installDesignerViewport(options: DesignerViewportOptions) {
  const { target } = options;
  const doc = target.ownerDocument;
  const win = doc.defaultView!;
  const frame = doc.createElement('div');
  frame.className = 'pointlesh-viewport-frame';
  frame.hidden = true;
  const style = doc.createElement('style');
  style.textContent = `
    .pointlesh-designer-viewport { position:fixed!important; left:var(--pointlesh-view-x)!important; top:var(--pointlesh-view-y)!important; width:var(--pointlesh-view-width)!important; height:var(--pointlesh-view-height)!important; margin:0!important; max-width:none!important; max-height:none!important; }
    .pointlesh-viewport-frame { position:fixed; z-index:2147482999; pointer-events:none; border:1px solid #748193; box-sizing:border-box; }
    .pointlesh-viewport-frame[hidden] { display:none; }
    .pointlesh-viewport-frame button { all:initial; box-sizing:border-box; position:absolute; pointer-events:auto; color:#e4e9f0; background:#27303e; border:1px solid #748193; font:12px/1.4 system-ui,sans-serif; touch-action:none; cursor:pointer; }
    .pointlesh-viewport-frame button:focus-visible { outline:2px solid #99c3ff; }
    .pointlesh-viewport-frame .fit { top:-29px; left:0; padding:3px 9px; border-radius:4px; }
    .pointlesh-viewport-frame .right { right:-5px; top:0; width:10px; height:100%; cursor:ew-resize; background:transparent; border:0; }
    .pointlesh-viewport-frame .bottom { bottom:-5px; left:0; height:10px; width:100%; cursor:ns-resize; background:transparent; border:0; }
    .pointlesh-viewport-frame .corner { right:-7px; bottom:-7px; width:16px; height:16px; cursor:nwse-resize; border-radius:3px; }
  `;
  doc.head.append(style);
  doc.body.append(frame);
  let active = false;
  let manual: { width: number; height: number } | undefined;
  let rect = { x: 12, y: 64, width: 1, height: 1 };
  let bounds = { width: 1, height: 1 };
  let drag: { pointer: number; x: number; y: number; width: number; height: number; edge: string; handle: HTMLElement } | undefined;
  let lastLayout = '';
  let raf = 0;
  let destroyed = false;
  const fit = doc.createElement('button');
  fit.type = 'button'; fit.className = 'fit'; fit.textContent = 'Fit game view';
  fit.onclick = () => { manual = undefined; lastLayout = ''; };
  frame.append(fit);
  const endDrag = () => {
    if (drag?.handle.hasPointerCapture(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
    drag = undefined;
  };
  for (const edge of ['right', 'bottom', 'corner']) {
    const handle = doc.createElement('button');
    handle.type = 'button'; handle.className = edge;
    handle.setAttribute('aria-label', `Resize game view ${edge}`);
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, edge, handle };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (!(event.buttons & 1)) { endDrag(); return; }
      manual = {
        width: Math.min(bounds.width, Math.max(Math.min(160, bounds.width), drag.width + (edge === 'bottom' ? 0 : event.clientX - drag.x))),
        height: Math.min(bounds.height, Math.max(Math.min(180, bounds.height), drag.height + (edge === 'right' ? 0 : event.clientY - drag.y))),
      };
    });
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', () => { drag = undefined; });
    handle.addEventListener('keydown', event => {
      const dx = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0;
      const dy = event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0;
      if (!dx && !dy) return;
      event.preventDefault(); event.stopPropagation();
      manual = { width: Math.max(160, rect.width + (edge === 'bottom' ? 0 : dx)), height: Math.max(180, rect.height + (edge === 'right' ? 0 : dy)) };
    });
    frame.append(handle);
  }
  win.addEventListener('blur', endDrag);
  const restore = () => {
    endDrag(); active = false; manual = undefined; lastLayout = ''; frame.hidden = true;
    target.classList.remove('pointlesh-designer-viewport');
    for (const key of ['x', 'y', 'width', 'height']) target.style.removeProperty(`--pointlesh-view-${key}`);
    options.onResize?.();
  };
  const update = () => {
    if (destroyed) return;
    // The dock can be dragged or resized by any integrated designer. Read its
    // actual screen bounds, not a hard-coded panel width or a scene-only flag.
    const panel = [...doc.querySelectorAll<HTMLElement>('.ai-game-assets-in-game-designer-dock__panel:not([hidden])')]
      .find(element => element.getClientRects().length && win.getComputedStyle(element).visibility !== 'hidden');
    if (!panel) { if (active) restore(); }
    else {
      const viewport = win.visualViewport;
      const panelRect = panel.getBoundingClientRect();
      const available = designerViewportBounds({ x: viewport?.offsetLeft ?? 0, y: viewport?.offsetTop ?? 0, width: viewport?.width ?? win.innerWidth, height: viewport?.height ?? win.innerHeight }, panelRect);
      const { x, y } = available;
      bounds = available;
      const chrome = options.chromeHeight?.() ?? 0;
      const ratio = options.aspectRatio ?? 16 / 9;
      const width = Math.min(bounds.width, manual?.width ?? Math.max(1, bounds.height - chrome) * ratio);
      const height = Math.min(bounds.height, manual?.height ?? width / ratio + chrome);
      const next = JSON.stringify([x, y, width, height]);
      if (next !== lastLayout) {
        active = true; lastLayout = next; rect = { x, y, width, height };
        target.classList.add('pointlesh-designer-viewport');
        for (const [key, value] of Object.entries(rect)) target.style.setProperty(`--pointlesh-view-${key}`, `${value}px`);
        Object.assign(frame.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
        frame.hidden = false;
        options.onResize?.();
      }
    }
    raf = win.requestAnimationFrame(update);
  };
  raf = win.requestAnimationFrame(update);
  return {
    fit() { manual = undefined; lastLayout = ''; },
    destroy() { destroyed = true; win.cancelAnimationFrame(raf); restore(); win.removeEventListener('blur', endDrag); frame.remove(); style.remove(); },
  };
}
