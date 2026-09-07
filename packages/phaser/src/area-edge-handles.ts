import { prefabAttributeId, prefabInstanceIdFromAttributeId, resolveSceneArea, sceneLayerAreas, type SceneArea, type SceneSelection } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';
import type Phaser from 'phaser';

export type AreaHandlePoint = { x: number; y: number };
export type AreaHandleBounds = { left: number; top: number; right: number; bottom: number };

/** Find the nearest unobscured handle center, with its entire grip inside the viewport. */
export function constrainAreaHandle(point: AreaHandlePoint, viewport: AreaHandleBounds, occluders: readonly AreaHandleBounds[] = [], inset = 20): AreaHandlePoint | undefined {
  const bounds = { left: viewport.left + inset, right: viewport.right - inset, top: viewport.top + inset, bottom: viewport.bottom - inset };
  if (![point.x, point.y, ...Object.values(bounds), inset].every(Number.isFinite) || inset < 0 || bounds.left > bounds.right || bounds.top > bounds.bottom) return undefined;
  const clampX = (x: number) => Math.max(bounds.left, Math.min(bounds.right, x));
  const clampY = (y: number) => Math.max(bounds.top, Math.min(bounds.bottom, y));
  const blocked = occluders.map(rect => ({ left: rect.left - inset, right: rect.right + inset, top: rect.top - inset, bottom: rect.bottom + inset }));
  const xs = [clampX(point.x), bounds.left, bounds.right, ...blocked.flatMap(rect => [clampX(rect.left), clampX(rect.right)])];
  const ys = [clampY(point.y), bounds.top, bounds.bottom, ...blocked.flatMap(rect => [clampY(rect.top), clampY(rect.bottom)])];
  let best: AreaHandlePoint | undefined, distance = Infinity;
  for (const x of xs) for (const y of ys) {
    if (blocked.some(rect => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom)) continue;
    const nextDistance = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (nextDistance < distance) { distance = nextDistance; best = { x, y }; }
  }
  return best;
}

export type PhaserAreaEdgeHandlesOptions = {
  scene: Phaser.Scene;
  designer: SceneDesigner;
  camera?: () => Phaser.Cameras.Scene2D.Camera;
  /** Extra panels to avoid, in addition to the native designer and adventure inspector. */
  occluders?: () => readonly HTMLElement[];
};
export type PhaserAreaEdgeHandles = { sync(): void; destroy(): void };

type EditableArea = { area: SceneArea; selection: SceneSelection };

function selectedAreas(designer: SceneDesigner): EditableArea[] {
  if (!designer.isOpen()) return [];
  const selection = designer.getSelection();
  if (!selection || !['area', 'vertex', 'prefab', 'prefab-area', 'prefab-vertex'].includes(selection.type) || !['select', 'area-draw'].includes(designer.getMode())) return [];
  const manifest = designer.getManifest();
  if (designer.getOpenView() === 'prefabs') {
    if (selection.type !== 'prefab-area' && selection.type !== 'prefab-vertex') return [];
    const attribute = manifest.prefabs?.[selection.prefabId]?.attributes.find(attribute => attribute.id === selection.attributeId);
    if (!attribute || (attribute.kind !== 'area' && attribute.kind !== 'platform')) return [];
    const defaults = attribute.kind === 'area' ? attribute.area : attribute.platform;
    if (!defaults.visible || defaults.locked) return [];
    return [{ area: { ...defaults, id: prefabAttributeId(selection.prefabId, attribute.id) }, selection }];
  }
  if (selection.type === 'area' || selection.type === 'vertex') {
    try {
      const { layer, area } = resolveSceneArea(manifest, selection.sceneId, selection.areaId);
      return layer.visible && !layer.locked && area.visible && !area.locked ? [{ area, selection }] : [];
    } catch { return []; }
  }
  if (selection.type !== 'prefab') return [];
  const scene = manifest.scenes[selection.sceneId];
  if (!scene) return [];
  const layer = scene.layers.find(layer => layer.id === selection.layerId);
  if (!layer?.visible || layer.locked) return [];
  return sceneLayerAreas(manifest, layer)
    .filter(area => area.visible && !area.locked && prefabInstanceIdFromAttributeId(area.id) === selection.instanceId)
    .map(area => ({ area, selection: { type: 'area', sceneId: scene.id, layerId: layer.id, areaId: area.id } }));
}

/**
 * Display proxy grips for selected native vertices outside the usable canvas.
 * Selection and pointer-down never modify geometry. Once dragged, the vertex
 * follows the visible grip, preserving the pointer's offset within that grip.
 * Native updateAreaVertex retains curves, prefab overrides and undo history.
 */
export function installPhaserAreaEdgeHandles(options: PhaserAreaEdgeHandlesOptions): PhaserAreaEdgeHandles {
  const { scene, designer } = options, canvas = scene.game.canvas;
  const document = canvas.ownerDocument, window = document.defaultView!;
  const root = document.createElement('div');
  root.className = 'pointlesh-area-edge-handles';
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000' });
  document.body.append(root);
  const grips = new Map<string, HTMLButtonElement>();
  const size = 40, inset = size / 2 + 2;
  type Drag = { key: string; areaId: string; vertexId: string; selectionKey: string; pointerId: number; start: AreaHandlePoint; grip: AreaHandlePoint; current: AreaHandlePoint; historyWritten: boolean };
  let drag: Drag | undefined, destroyed = false;

  const camera = () => options.camera?.() ?? scene.cameras.main;
  const canvasBounds = (): AreaHandleBounds => {
    const rect = canvas.getBoundingClientRect();
    let width = rect.width, height = rect.height, left = rect.left, top = rect.top;
    // A phone layout can letterbox the canvas with object-fit: contain.
    if (window.getComputedStyle(canvas).objectFit === 'contain' && canvas.width && canvas.height) {
      const scale = Math.min(width / canvas.width, height / canvas.height);
      const fittedWidth = canvas.width * scale, fittedHeight = canvas.height * scale;
      left += (width - fittedWidth) / 2; top += (height - fittedHeight) / 2;
      width = fittedWidth; height = fittedHeight;
    }
    return { left, top, right: left + width, bottom: top + height };
  };
  const project = (point: AreaHandlePoint, bounds: AreaHandleBounds): AreaHandlePoint => {
    // This is the inverse of Phaser's public getWorldPoint, including viewport,
    // scrolling, origin, rotation and independent X/Y zoom.
    const cam = camera(), origin = cam.getWorldPoint(0, 0), right = cam.getWorldPoint(1, 0), down = cam.getWorldPoint(0, 1);
    const a = right.x - origin.x, b = right.y - origin.y, c = down.x - origin.x, d = down.y - origin.y;
    const determinant = a * d - b * c, x = point.x - origin.x, y = point.y - origin.y;
    return { x: bounds.left + (d * x - c * y) / determinant * (bounds.right - bounds.left) / canvas.width, y: bounds.top + (a * y - b * x) / determinant * (bounds.bottom - bounds.top) / canvas.height };
  };
  const unproject = (point: AreaHandlePoint, bounds: AreaHandleBounds): AreaHandlePoint => camera().getWorldPoint((point.x - bounds.left) * canvas.width / (bounds.right - bounds.left), (point.y - bounds.top) * canvas.height / (bounds.bottom - bounds.top));
  const finishDrag = () => { drag = undefined; };
  const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const move = (event: PointerEvent) => {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    consume(event);
    if (!designer.isOpen() || JSON.stringify(designer.getSelection()) !== current.selectionKey) { finishDrag(); sync(); return; }
    const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
    if (!current.historyWritten && dx === 0 && dy === 0) return;
    // The proxy represents an offscreen point, rather than its true projected
    // position. On actual movement, bring the point under the visible grip so a
    // distant vertex can be pulled into view in one gesture.
    const gripPosition = { x: current.grip.x + dx, y: current.grip.y + dy };
    const { x, y } = unproject(gripPosition, canvasBounds());
    if (x === current.current.x && y === current.current.y) return;
    current.current = { x, y };
    const history = !current.historyWritten;
    current.historyWritten = true;
    designer.updateAreaVertex(current.areaId, current.vertexId, { x, y }, { history });
    const grip = grips.get(current.key);
    if (grip) { grip.style.left = `${gripPosition.x}px`; grip.style.top = `${gripPosition.y}px`; }
  };
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    move(event); finishDrag(); sync();
  };
  const cancel = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    consume(event); finishDrag(); sync();
  };
  const keydown = (event: KeyboardEvent) => {
    if (drag && (event.key === 'Escape' || (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)))) finishDrag();
  };
  const start = (event: PointerEvent, key: string, entry: EditableArea, vertexId: string, grip: AreaHandlePoint) => {
    if (event.button !== 0 || drag) return;
    consume(event);
    const vertex = entry.area.vertices.find(vertex => vertex.id === vertexId)!;
    const point = { x: event.clientX, y: event.clientY };
    const selection: SceneSelection = entry.selection.type === 'prefab-area' || entry.selection.type === 'prefab-vertex'
      ? { ...entry.selection, type: 'prefab-vertex', vertexId }
      : { ...entry.selection as Extract<SceneSelection, { type: 'area' | 'vertex' }>, type: 'vertex', vertexId };
    drag = { key, areaId: entry.area.id, vertexId, selectionKey: JSON.stringify(selection), pointerId: event.pointerId, start: point, grip, current: { x: vertex.x, y: vertex.y }, historyWritten: false };
    designer.select(selection);
  };
  function sync() {
    if (destroyed) return;
    const entries = selectedAreas(designer);
    if (!entries.length) {
      finishDrag();
      for (const button of grips.values()) button.remove();
      grips.clear();
      return;
    }
    if (drag && (!entries.some(entry => entry.area.id === drag!.areaId && entry.area.vertices.some(vertex => vertex.id === drag!.vertexId)) || JSON.stringify(designer.getSelection()) !== drag.selectionKey)) finishDrag();
    const bounds = canvasBounds(), cam = camera(), sx = (bounds.right - bounds.left) / canvas.width, sy = (bounds.bottom - bounds.top) / canvas.height;
    const viewport = { left: Math.max(0, bounds.left, bounds.left + cam.x * sx), top: Math.max(0, bounds.top, bounds.top + cam.y * sy), right: Math.min(window.innerWidth, bounds.right, bounds.left + (cam.x + cam.width) * sx), bottom: Math.min(window.innerHeight, bounds.bottom, bounds.top + (cam.y + cam.height) * sy) };
    const occluders: AreaHandleBounds[] = [];
    for (const element of new Set([...document.querySelectorAll<HTMLElement>('.scene-designer__panel, .pointlesh-inspector'), ...(options.occluders?.() ?? [])])) {
      const style = window.getComputedStyle(element), rect = element.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width && rect.height) occluders.push(rect);
    }
    const occupied: AreaHandleBounds[] = [], needed = new Set<string>();
    for (const entry of entries) for (const [index, vertex] of entry.area.vertices.entries()) {
      const key = `${entry.area.id}/${vertex.id}`, point = project(vertex, bounds);
      const nearest = constrainAreaHandle(point, viewport, occluders, inset);
      if (!nearest || (nearest.x === point.x && nearest.y === point.y && drag?.key !== key)) continue;
      const position = constrainAreaHandle(point, viewport, [...occluders, ...occupied], inset);
      if (!position) continue;
      needed.add(key);
      occupied.push({ left: position.x - size / 2, right: position.x + size / 2, top: position.y - size / 2, bottom: position.y + size / 2 });
      let button = grips.get(key);
      if (!button) {
        button = document.createElement('button'); button.type = 'button';
        button.className = 'pointlesh-area-edge-handle';
        button.dataset.areaId = entry.area.id; button.dataset.vertexId = vertex.id;
        Object.assign(button.style, { position: 'fixed', transform: 'translate(-50%, -50%)', width: `${size}px`, height: `${size}px`, padding: '0', border: '2px solid #10251b', borderRadius: '50%', color: '#10251b', background: '#f4d77d', boxShadow: '0 0 0 1px #fff8', font: 'bold 12px system-ui', touchAction: 'none', pointerEvents: 'auto', cursor: 'grab' });
        root.append(button); grips.set(key, button);
      }
      button.textContent = String(index + 1);
      button.setAttribute('aria-label', `Drag offscreen vertex ${index + 1} of ${entry.area.tag || entry.area.id}`);
      button.title = `Vertex ${index + 1} (${Math.round(vertex.x)}, ${Math.round(vertex.y)}). Drag to move; selection preserves its position.`;
      button.onpointerdown = event => start(event, key, entry, vertex.id, position);
      if (drag?.key !== key) { button.style.left = `${position.x}px`; button.style.top = `${position.y}px`; }
    }
    for (const [key, button] of grips) if (!needed.has(key) && drag?.key !== key) { button.remove(); grips.delete(key); }
  }
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; finishDrag();
    scene.game.events.off('postrender', sync); scene.events.off('shutdown', destroy);
    window.removeEventListener('resize', sync); window.removeEventListener('scroll', sync, true);
    window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('keydown', keydown, true); window.removeEventListener('blur', finishDrag);
    root.remove(); grips.clear();
  };
  scene.game.events.on('postrender', sync); scene.events.once('shutdown', destroy);
  window.addEventListener('resize', sync); window.addEventListener('scroll', sync, true);
  window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('keydown', keydown, true); window.addEventListener('blur', finishDrag);
  sync();
  return { sync, destroy };
}
