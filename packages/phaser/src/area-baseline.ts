import { isPointleshPrefab, pointleshAreaCapabilities, type PointleshPrefabInstance } from '@pointlesh/core';
import { prefabAttributeId, prefabInstanceIdFromAttributeId, resolvePrefabNumber, resolveSceneArea, type SceneAreaVertex } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';
import type { PointleshInspector } from '@pointlesh/designer';
import type Phaser from 'phaser';

export type PhaserAreaBaselineOptions = {
  scene: Phaser.Scene;
  designer: SceneDesigner;
  inspector: PointleshInspector;
  camera?: () => Phaser.Cameras.Scene2D.Camera;
  depth?: number;
};

type BaselineTarget = { key: string; prefabId: string; instanceId?: string; baseline: number; vertices: SceneAreaVertex[] };

/** A selected walk-behind area's authored Y baseline, edited through inspector history. */
export function installPhaserAreaBaseline(options: PhaserAreaBaselineOptions): { sync(): void; destroy(): void } {
  const { scene, designer, inspector } = options;
  const canvas = scene.game.canvas;
  const window = canvas.ownerDocument.defaultView!;
  const camera = options.camera ?? (() => scene.cameras.main);
  const line = scene.add.graphics().setDepth(options.depth ?? 10002).setName('pointlesh-area-baseline');
  const label = scene.add.text(0, 0, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#fff1f8',
    backgroundColor: '#492c43', padding: { x: 8, y: 5 },
  }).setDepth((options.depth ?? 10002) + .1).setName('pointlesh-area-baseline-label');
  let target: BaselineTarget | undefined;
  let dirty = true, destroyed = false, drawKey = '', selectionKey = '';
  let drag: { target: BaselineTarget; pointerId: number; offsetY: number; changed: boolean } | undefined;
  let cursorBefore: string | undefined;

  function selectedTarget(): BaselineTarget | undefined {
    const selection = designer.getSelection();
    if (!selection || !designer.isOpen()) return;
    const manifest = designer.getManifest();
    const instanceId = selection.type === 'prefab' ? selection.instanceId
      : 'areaId' in selection ? prefabInstanceIdFromAttributeId(selection.areaId) : undefined;
    let instance: PointleshPrefabInstance | undefined;
    let sceneId: string | undefined;
    if (instanceId) for (const definition of Object.values(manifest.scenes)) for (const layer of definition.layers) {
      const match = layer.prefabs?.find(instance => instance.id === instanceId);
      if (match) { instance = match as PointleshPrefabInstance; sceneId = definition.id; }
    }
    const prefabId = instance?.prefabId ?? ('prefabId' in selection ? selection.prefabId : undefined);
    const prefab = prefabId ? manifest.prefabs?.[prefabId] : undefined;
    if (!prefab || !isPointleshPrefab(prefab)) return;
    const properties = { ...prefab.pointlesh.properties, ...instance?.pointlesh?.properties };
    if (!pointleshAreaCapabilities({ kind: prefab.pointlesh.kind, properties }).walkBehind) return;
    const attributes = prefab.attributes.filter(attribute => attribute.kind === 'area' || attribute.kind === 'platform');
    const attribute = attributes.find(attribute => 'attributeId' in selection && attribute.id === selection.attributeId
      || instanceId && 'areaId' in selection && prefabAttributeId(instanceId, attribute.id) === selection.areaId) ?? attributes[0];
    if (!attribute || (attribute.kind !== 'area' && attribute.kind !== 'platform')) return;
    const numeric = prefab.attributes.find(attribute => attribute.id === 'baseline' && attribute.kind === 'number');
    const baseline = numeric ? resolvePrefabNumber(manifest, prefab.id, 'baseline', instance) : Number(properties.baseline ?? 160);
    if (!Number.isFinite(baseline)) return;
    const area = instance && sceneId ? resolveSceneArea(manifest, sceneId, prefabAttributeId(instance.id, attribute.id)).area
      : attribute.kind === 'area' ? attribute.area : attribute.platform;
    return { key: `${instance?.id ?? prefab.id}:${attribute.id}`, prefabId: prefab.id, instanceId: instance?.id, baseline, vertices: area.vertices };
  }

  function worldPoint(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return camera().getWorldPoint((event.clientX - rect.left) * scene.scale.width / rect.width, (event.clientY - rect.top) * scene.scale.height / rect.height);
  }

  function stop(event: PointerEvent) { event.preventDefault(); event.stopImmediatePropagation(); }

  function hit(event: PointerEvent) {
    if (!target || !designer.isOpen() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const point = worldPoint(event), view = camera();
    const rect = canvas.getBoundingClientRect();
    const worldPixel = scene.scale.height / rect.height / Math.max(view.zoom, .001);
    // Native vertex and curve handles retain priority where they cross the baseline.
    for (const vertex of target.vertices) {
      if (Math.hypot(point.x - vertex.x, point.y - vertex.y) < 12 * worldPixel) return false;
      if (vertex.curve && Math.hypot(point.x - vertex.curve.cx, point.y - vertex.curve.cy) < 12 * worldPixel) return false;
    }
    return Math.abs(point.y - target.baseline) <= 7 * worldPixel || label.getBounds().contains(point.x, point.y);
  }

  function setCursor(active: boolean) {
    if (active) {
      if (cursorBefore === undefined) cursorBefore = canvas.style.cursor;
      canvas.style.cursor = 'ns-resize';
    } else if (cursorBefore !== undefined) {
      if (canvas.style.cursor === 'ns-resize') canvas.style.cursor = cursorBefore;
      cursorBefore = undefined;
    }
  }

  function down(event: PointerEvent) {
    update();
    if (event.button !== 0 || !target || !hit(event)) return;
    stop(event);
    drag = { target: { ...target }, pointerId: event.pointerId, offsetY: worldPoint(event).y - target.baseline, changed: false };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    setCursor(true);
  }

  function move(event: PointerEvent) {
    if (!drag) { setCursor(hit(event)); return; }
    if (event.pointerId !== drag.pointerId) return;
    stop(event);
    const baseline = Math.round(worldPoint(event).y - drag.offsetY);
    if (baseline === target?.baseline) return;
    const editOptions = { history: !drag.changed };
    if (drag.target.instanceId) inspector.setProperties(drag.target.instanceId, { baseline }, editOptions);
    else inspector.setPrefabProperties(drag.target.prefabId, { baseline }, editOptions);
    drag.changed = true; dirty = true; update();
  }

  function up(event?: PointerEvent) {
    if (!drag || event && event.pointerId !== drag.pointerId) return;
    if (event) stop(event);
    drag = undefined;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    setCursor(false);
  }

  function update() {
    if (destroyed) return;
    const selected = `${designer.isOpen()}:${JSON.stringify(designer.getSelection())}`;
    if (selectionKey !== selected) { dirty = true; selectionKey = selected; }
    if (dirty) { target = selectedTarget(); dirty = false; }
    if (drag && (!target || target.key !== drag.target.key)) up();
    if (!target) { line.setVisible(false); label.setVisible(false); drawKey = ''; setCursor(false); return; }
    const view = camera();
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(view.zoom, .001);
    const pixelX = scene.scale.width / Math.max(rect.width, 1) / zoom;
    const pixelY = scene.scale.height / Math.max(rect.height, 1) / zoom;
    const left = view.getWorldPoint(view.x, view.y + view.height / 2).x;
    const right = view.getWorldPoint(view.x + view.width, view.y + view.height / 2).x;
    const key = `${target.key}:${target.baseline}:${left}:${right}:${pixelX}:${pixelY}`;
    if (key === drawKey) return;
    drawKey = key;
    const y = target.baseline;
    // Keep the label and grip readable when either the camera or CSS scales the canvas.
    line.setVisible(true).clear().lineStyle(2 * pixelY, 0xff8fc7, 1).lineBetween(left, y, right, y);
    line.fillStyle(0xff8fc7, 1).fillRect(left + 14 * pixelX, y - 5 * pixelY, 10 * pixelX, 10 * pixelY);
    label.setVisible(true).setText(`↕ Walk-behind baseline · Y ${y}`).setPosition(left + 12 * pixelX, y - 31 * pixelY).setScale(pixelX, pixelY);
  }

  const observer = new window.MutationObserver(() => { dirty = true; });
  observer.observe(designer.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  const leave = () => { if (!drag) setCursor(false); };
  const blur = () => up();
  const keydown = (event: KeyboardEvent) => {
    if (drag && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); up(); }
  };
  canvas.addEventListener('pointerleave', leave);
  window.addEventListener('blur', blur);
  window.addEventListener('keydown', keydown, true);
  scene.events.on('update', update);
  const destroy = () => {
    if (destroyed) return;
    up(); destroyed = true;
    observer.disconnect();
    canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true); canvas.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', blur); window.removeEventListener('keydown', keydown, true);
    scene.events.off('update', update); scene.events.off('shutdown', destroy);
    line.destroy(); label.destroy();
  };
  scene.events.once('shutdown', destroy);
  update();
  return { sync() { dirty = true; update(); }, destroy };
}
