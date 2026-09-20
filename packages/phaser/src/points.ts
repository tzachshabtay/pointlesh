import { isPointleshPrefab, resolvePointleshScene, type Point } from '@pointlesh/core';
import { resolvePrefabNumber, type SceneSelection } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';
import type { PointleshInspector } from '@pointlesh/designer';
import type Phaser from 'phaser';

type Marker = { id: string; name: string; position: Point; selection: SceneSelection; locked: boolean; definition?: boolean };

/** Editor-only coordinate markers. No game texture, sprite or collision shape is created. */
export function installPhaserPointHandles(options: { scene: Phaser.Scene; designer: SceneDesigner; inspector: PointleshInspector }) {
  const { scene, designer, inspector } = options, canvas = scene.game.canvas;
  const document = canvas.ownerDocument, window = document.defaultView!;
  const root = document.createElement('div'); root.className = 'pointlesh-point-handles';
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000' });
  const style = document.createElement('style'); style.textContent = `
.pointlesh-point-handle{position:fixed;transform:translate(-50%,-50%);width:22px;height:22px;border:2px solid #8bb8ff;border-radius:50%;background:#111722;color:#f5f7fb;pointer-events:auto;touch-action:none;cursor:grab;padding:0;box-sizing:border-box;font:16px/18px system-ui;}
.pointlesh-point-handle[aria-pressed=true]{border-color:#ffe08a;background:#3a3423}
.pointlesh-point-handle:disabled{cursor:default;opacity:.55}
.pointlesh-point-handle>span{position:absolute;left:27px;top:0;background:#1b2230;border:1px solid #58657a;border-radius:4px;padding:2px 5px;font:11px/16px system-ui;white-space:nowrap;pointer-events:none}
.pointlesh-point-handle:focus-visible{outline:2px solid #ffe08a;outline-offset:3px}
`;
  root.append(style); document.body.append(root);
  const handles = new Map<string, HTMLButtonElement>();
  let markers: Marker[] = [], dirty = true, destroyed = false, context = '';
  let drag: { marker: Marker; pointerId: number; start: Point; origin: Point; changed: boolean; selection: string } | undefined;
  function bounds() {
    const rect = canvas.getBoundingClientRect();
    let { left, top, width, height } = rect;
    if (window.getComputedStyle(canvas).objectFit === 'contain' && canvas.width && canvas.height) {
      const scale = Math.min(width / canvas.width, height / canvas.height);
      left += (width - canvas.width * scale) / 2; top += (height - canvas.height * scale) / 2;
      width = canvas.width * scale; height = canvas.height * scale;
    }
    return { left, top, width, height };
  }
  function project(point: Point) {
    const rect = bounds(), camera = scene.cameras.main;
    const origin = camera.getWorldPoint(0, 0), right = camera.getWorldPoint(1, 0), down = camera.getWorldPoint(0, 1);
    const a = right.x - origin.x, b = right.y - origin.y, c = down.x - origin.x, d = down.y - origin.y;
    const determinant = a * d - b * c, x = point.x - origin.x, y = point.y - origin.y;
    return { x: rect.left + (d * x - c * y) / determinant * rect.width / scene.scale.gameSize.width,
      y: rect.top + (a * y - b * x) / determinant * rect.height / scene.scale.gameSize.height };
  }
  function unproject(point: Point) {
    const rect = bounds();
    return scene.cameras.main.getWorldPoint((point.x - rect.left) * scene.scale.gameSize.width / rect.width, (point.y - rect.top) * scene.scale.gameSize.height / rect.height);
  }
  function readMarkers(): Marker[] {
    const manifest = designer.getManifest(), selection = designer.getSelection();
    if (designer.getOpenView() === 'prefabs') {
      const prefabId = selection && 'prefabId' in selection ? selection.prefabId : undefined;
      const prefab = prefabId ? manifest.prefabs?.[prefabId] : undefined;
      return prefab && isPointleshPrefab(prefab) && prefab.pointlesh.kind === 'point' ? [{ id: prefab.id, name: prefab.name,
        position: { x: resolvePrefabNumber(manifest, prefab.id, 'x'), y: resolvePrefabNumber(manifest, prefab.id, 'y') },
        selection: { type: 'prefab-definition', prefabId: prefab.id }, definition: true, locked: false }] : [];
    }
    const room = resolvePointleshScene(manifest, designer.getSceneId());
    return room.points.filter(point => point.enabled && point.visible).map(point => {
      const layer = manifest.scenes[room.id]!.layers.find(layer => layer.id === point.layerId)!;
      return { id: point.id, name: point.name, position: point.position,
        selection: { type: 'prefab', sceneId: room.id, layerId: layer.id, instanceId: point.id },
        locked: layer.locked || !!layer.prefabs?.find(instance => instance.id === point.id)?.locked };
    });
  }
  const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const finish = () => { drag = undefined; };
  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stop(event);
    if (!designer.isOpen() || JSON.stringify(designer.getSelection()) !== drag.selection) { finish(); return; }
    const pointer = unproject({ x: event.clientX, y: event.clientY });
    const x = drag.origin.x + pointer.x - drag.start.x, y = drag.origin.y + pointer.y - drag.start.y;
    if (!drag.changed && Math.hypot(x - drag.origin.x, y - drag.origin.y) < .01) return;
    const edit = { history: !drag.changed }; drag.changed = true;
    if (drag.marker.definition) inspector.setPrefabProperties(drag.marker.id, { x, y }, edit);
    else inspector.setProperties(drag.marker.id, { x, y }, edit);
    dirty = true; sync();
  }
  function up(event: PointerEvent) { if (drag && event.pointerId === drag.pointerId) { move(event); finish(); } }
  function cancel(event: PointerEvent) { if (drag && event.pointerId === drag.pointerId) { stop(event); finish(); } }
  function keydown(event: KeyboardEvent) { if (event.key === 'Escape' || event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) finish(); }
  function sync() {
    if (destroyed) return;
    const selection = designer.getSelection();
    const next = `${designer.isOpen()}:${designer.getOpenView()}:${designer.getSceneId()}:${designer.getMode()}:${JSON.stringify(selection)}`;
    if (context !== next) { context = next; dirty = true; }
    root.hidden = !designer.isOpen() || designer.getMode() !== 'select';
    if (root.hidden) { finish(); return; }
    if (dirty) { markers = readMarkers(); dirty = false; }
    if (drag && (!markers.some(marker => marker.id === drag!.marker.id && !marker.locked) || JSON.stringify(selection) !== drag.selection)) finish();
    const rect = bounds();
    const panels = [...document.querySelectorAll<HTMLElement>('.scene-designer__panel')].filter(panel => panel.getClientRects().length).map(panel => panel.getBoundingClientRect());
    for (const marker of markers) {
      let handle = handles.get(marker.id);
      if (!handle) {
        handle = document.createElement('button'); handle.type = 'button'; handle.className = 'pointlesh-point-handle'; handle.dataset.pointId = marker.id;
        handle.append(document.createTextNode('+'), document.createElement('span'));
        root.append(handle); handles.set(marker.id, handle);
      }
      const position = project(marker.position);
      handle.hidden = position.x < Math.max(0, rect.left) || position.y < Math.max(0, rect.top) || position.x > Math.min(window.innerWidth, rect.left + rect.width) || position.y > Math.min(window.innerHeight, rect.top + rect.height)
        || panels.some(panel => position.x >= panel.left - 12 && position.x <= panel.right + 12 && position.y >= panel.top - 12 && position.y <= panel.bottom + 12);
      handle.style.left = `${position.x}px`; handle.style.top = `${position.y}px`;
      handle.disabled = marker.locked;
      handle.setAttribute('aria-label', `Point: ${marker.name}`);
      handle.setAttribute('aria-pressed', String(selection && ('instanceId' in selection ? selection.instanceId === marker.id : 'prefabId' in selection && selection.prefabId === marker.id)));
      handle.title = `${marker.name} (${Math.round(marker.position.x)}, ${Math.round(marker.position.y)})`;
      handle.querySelector('span')!.textContent = marker.name;
      handle.onpointerdown = event => {
        if (event.button !== 0 || marker.locked) return;
        stop(event); designer.select(marker.selection); inspector.sync();
        drag = { marker, pointerId: event.pointerId, start: unproject({ x: event.clientX, y: event.clientY }), origin: { ...marker.position }, changed: false, selection: JSON.stringify(marker.selection) };
      };
      handle.onclick = () => { designer.select(marker.selection); inspector.sync(); };
    }
    for (const [id, handle] of handles) if (!markers.some(marker => marker.id === id)) { handle.remove(); handles.delete(id); }
  }
  const observer = new window.MutationObserver(() => { dirty = true; });
  observer.observe(designer.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });
  scene.game.events.on('postrender', sync);
  window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('blur', finish); window.addEventListener('keydown', keydown, true);
  function destroy() {
    if (destroyed) return; destroyed = true; finish(); observer.disconnect(); root.remove(); handles.clear();
    scene.game.events.off('postrender', sync); scene.events.off('shutdown', destroy);
    window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('blur', finish); window.removeEventListener('keydown', keydown, true);
  }
  scene.events.once('shutdown', destroy); sync();
  return { sync() { dirty = true; sync(); }, destroy };
}
