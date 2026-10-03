import type { AiAssetManifest } from '@ai-game-assets/core';
import type { PointleshPoint, PointleshProperties } from '@pointlesh/core';

/** The inventory hotspot uses icon-local coordinates, independent of a room's camera or pivot. */
export function inventoryItemEditor(options: {
  document: Document; assets: AiAssetManifest; values: PointleshProperties;
  previewUrl?: (assetId: string) => string | undefined;
  assetBaseUrl?: string;
  commit: (patch: PointleshProperties) => void;
}): HTMLElement {
  const { document, assets, values, commit } = options;
  const root = document.createElement('div'); root.className = 'pointlesh-inventory-editor';
  const graphics = Object.values(assets.assets).filter(asset => ['image', 'animation', 'spritesheet'].includes(asset.kind));
  function assetField(label: string, key: string, optional = false) {
    const field = document.createElement('label'); field.className = 'pointlesh-inspector-field';
    const title = document.createElement('span'); title.textContent = label;
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    if (optional || !values[key]) select.add(new Option(optional ? 'None' : 'Choose a graphic', ''));
    for (const asset of graphics) select.add(new Option(asset.id, asset.id));
    const current = String(values[key] ?? '');
    if (current && !graphics.some(asset => asset.id === current)) select.add(new Option(`${current} (missing)`, current));
    select.value = current; select.addEventListener('change', () => commit({ [key]: select.value }));
    field.append(title, select); return field;
  }
  root.append(assetField('Inventory graphic', 'assetId'));
  const assetId = String(values.assetId ?? ''), asset = assets.assets[assetId];
  const version = asset?.versions[asset.activeVersion];
  let url = options.previewUrl?.(assetId);
  if (!url && version?.file) url = /^(data:|blob:|https?:\/\/)/i.test(version.file) ? version.file
    : new URL(version.file.replace(/^\/+/, ''), new URL(options.assetBaseUrl ?? '.', document.baseURI)).href;
  let point: PointleshPoint = { x: Number(values.interactionX ?? .5), y: Number(values.interactionY ?? .5) };
  const controls: HTMLInputElement[] = [];
  const preview = document.createElement('div'); preview.className = 'pointlesh-inventory-preview';
  const dimensions = asset?.frameGrid ? { width: asset.frameGrid.frameWidth, height: asset.frameGrid.frameHeight } : asset?.dimensions;
  preview.style.aspectRatio = `${dimensions?.width ?? 1} / ${dimensions?.height ?? 1}`;
  const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'pointlesh-inventory-interaction-point';
  marker.setAttribute('aria-label', 'Interaction point'); marker.title = 'Drag the interaction point. Arrow keys move it one pixel.';
  const redraw = () => {
    marker.style.left = `${point.x * 100}%`; marker.style.top = `${point.y * 100}%`;
    controls.forEach((input, index) => { input.value = String(index ? point.y : point.x); });
    marker.setAttribute('aria-description', `X ${point.x}, Y ${point.y}, measured from the icon’s top-left.`);
  };
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const commitPoint = () => commit({ interactionX: point.x, interactionY: point.y });
  if (url) {
    const image = document.createElement('img'); image.src = url; image.alt = 'Inventory item preview'; image.draggable = false;
    preview.append(image, marker); root.append(preview);
    let drag: { id: number; start: PointleshPoint } | undefined;
    const move = (event: PointerEvent) => {
      const bounds = preview.getBoundingClientRect();
      if (bounds.width && bounds.height) point = {
        x: Math.round(clamp((event.clientX - bounds.left) / bounds.width) * 10000) / 10000,
        y: Math.round(clamp((event.clientY - bounds.top) / bounds.height) * 10000) / 10000,
      };
      redraw();
    };
    marker.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag = { id: event.pointerId, start: { ...point } }; marker.setPointerCapture(event.pointerId);
    });
    marker.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!(event.buttons & 1)) { drag = undefined; commitPoint(); return; }
      event.preventDefault(); move(event);
    });
    marker.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return;
      move(event); drag = undefined; marker.releasePointerCapture(event.pointerId); commitPoint();
    });
    const cancel = () => { if (drag) { point = drag.start; drag = undefined; redraw(); } };
    marker.addEventListener('pointercancel', cancel); marker.addEventListener('lostpointercapture', cancel);
    marker.addEventListener('keydown', event => {
      const offset = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!offset) return;
      event.preventDefault();
      point = { x: clamp(point.x + offset[0]! / (dimensions?.width ?? 100)), y: clamp(point.y + offset[1]! / (dimensions?.height ?? 100)) };
      commitPoint();
    });
  }
  for (const [axis, label] of [['x', 'Interaction point X'], ['y', 'Interaction point Y']] as const) {
    const field = document.createElement('label'); field.className = 'pointlesh-inspector-field';
    const title = document.createElement('span'); title.textContent = label;
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '1'; input.step = '.01'; input.setAttribute('aria-label', label);
    input.addEventListener('change', () => { const value = input.valueAsNumber; if (Number.isFinite(value)) { point[axis] = clamp(value); commitPoint(); } });
    controls.push(input); field.append(title, input); root.append(field);
  }
  redraw();
  const help = document.createElement('p'); help.className = 'pointlesh-inspector-help';
  help.textContent = 'Drag the marker onto the part of the item that touches a hotspot. Coordinates run from 0 to 1, starting at the top-left. The cursor and its crosshair use this same point.';
  root.append(help, assetField('Crosshair graphic', 'crosshairAssetId', true));
  const label = document.createElement('label'); label.className = 'pointlesh-inspector-field';
  const title = document.createElement('span'); title.textContent = 'Crosshair animation';
  const animation = document.createElement('input'); animation.value = String(values.crosshairAnimationKey ?? 'idle'); animation.setAttribute('aria-label', 'Crosshair animation');
  animation.addEventListener('change', () => commit({ crosshairAnimationKey: animation.value })); label.append(title, animation); root.append(label);
  return root;
}
