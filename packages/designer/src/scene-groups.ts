import { createPointleshInstance, extendPointleshPrefab, isPointleshArea, isPointleshPrefab, sceneBackground, type PointleshSceneWithBackground } from '@pointlesh/core';
import type { AiAssetManifest } from '@ai-game-assets/core';
import type { SceneArea, SceneDesignerManifest, SceneLayer, SceneObject, ScenePrefabInstance } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';
import { isPrefabTemplate } from './prefab-browser.js';

export type SceneGroupKind = 'character' | 'object' | 'point' | 'area' | 'hotspot';
const groups: { kind: SceneGroupKind; title: string }[] = [
  { kind: 'character', title: 'Characters' }, { kind: 'object', title: 'Objects' },
  { kind: 'point', title: 'Points' }, { kind: 'area', title: 'Areas' },
  { kind: 'hotspot', title: 'Hotspots' },
];
type Item = { id: string; name: string; kind: SceneGroupKind; layer: SceneLayer; entity: ScenePrefabInstance | SceneObject | SceneArea; source: 'prefab' | 'object' | 'area' };

/** A scene-wide authoring view; the underlying layers keep their render order. */
export function sceneGroupItems(manifest: SceneDesignerManifest, sceneId: string): Item[] {
  const scene = manifest.scenes[sceneId];
  if (!scene) return [];
  const items: Item[] = [];
  for (const layer of scene.layers) {
    for (const instance of layer.prefabs ?? []) {
      const prefab = manifest.prefabs?.[instance.prefabId];
      if (!prefab) continue;
      const kind = isPointleshPrefab(prefab) ? prefab.pointlesh.kind : 'object';
      if (!groups.some(group => group.kind === kind)) continue;
      items.push({ id: instance.id, name: instance.name || prefab.name, kind: kind as SceneGroupKind, layer, entity: instance, source: 'prefab' });
    }
    for (const object of layer.objects) items.push({ id: object.id, name: object.tag || object.assetId, kind: 'object', layer, entity: object, source: 'object' });
    for (const area of layer.areas) items.push({ id: area.id, name: isPointleshArea(area) ? area.pointlesh.name : area.tag || 'Area',
      kind: isPointleshArea(area) && area.pointlesh.kind === 'hotspot' ? 'hotspot' : 'area', layer, entity: area, source: 'area' });
  }
  return items;
}

export function installSceneGroups(designer: SceneDesigner, commit: (manifest: SceneDesignerManifest) => void,
  addArea: (sceneId: string, layerId: string, kind: 'area' | 'hotspot') => void,
  getAssets: () => AiAssetManifest,
  assetPreviewUrl?: (assetId: string) => string | undefined) {
  const document = designer.root.ownerDocument;
  const root = document.createElement('div'); root.className = 'pointlesh-scene-groups'; root.setAttribute('aria-label', 'Scene groups');
  const previous = new Map<string, Map<string, boolean>>();
  let renderedKey = '';
  function editBackground(sceneId: string) {
    const available = Object.values(getAssets().assets).filter(asset => asset.kind === 'image');
    const current = sceneBackground(designer.getManifest().scenes[sceneId]);
    const dialog = document.createElement('dialog'); dialog.className = 'scene-designer__dialog pointlesh-scene-background-dialog';
    dialog.setAttribute('aria-label', current ? 'Edit background' : 'Add background');
    const form = document.createElement('form'); form.className = 'scene-designer__stack';
    const title = document.createElement('strong'); title.textContent = current ? 'Edit scene background' : 'Add scene background';
    const label = document.createElement('label'); label.textContent = 'Image asset';
    const select = document.createElement('select'); select.className = 'scene-designer__select'; select.setAttribute('aria-label', 'Background image asset');
    for (const asset of available) {
      const option = document.createElement('option'); option.value = asset.id; option.textContent = asset.id;
      select.append(option);
    }
    if (current && !available.some(asset => asset.id === current.assetId)) {
      const option = document.createElement('option'); option.value = current.assetId; option.textContent = `${current.assetId} (missing asset)`;
      select.prepend(option);
    }
    if (current) select.value = current.assetId;
    label.append(select);
    const actions = document.createElement('div'); actions.className = 'scene-designer__dialog-actions';
    const cancel = button('Cancel', 'Cancel', () => dialog.close());
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'scene-designer__button'; save.textContent = current ? 'Apply' : 'Add';
    save.disabled = !select.options.length;
    actions.append(cancel, save); form.append(title, label, actions); dialog.append(form); designer.root.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', event => {
      event.preventDefault();
      const next = designer.getManifest(), scene = next.scenes[sceneId] as PointleshSceneWithBackground;
      if (!scene || !select.value) return;
      scene.pointleshBackground = { assetId: select.value, visible: current?.visible ?? true, locked: current?.locked ?? false };
      commit(next); dialog.close();
    });
    dialog.showModal();
  }
  function toggleBackground(sceneId: string, property: 'visible' | 'locked') {
    const next = designer.getManifest(), background = sceneBackground(next.scenes[sceneId]);
    if (!background) return;
    background[property] = !background[property]; commit(next);
  }
  function renderBackground(sceneId: string, manifest: SceneDesignerManifest) {
    const background = sceneBackground(manifest.scenes[sceneId]);
    const section = document.createElement('section'); section.className = 'pointlesh-scene-group'; section.setAttribute('aria-label', 'Background');
    const heading = document.createElement('div'); heading.className = 'scene-designer__subhead';
    const title = document.createElement('span'); title.textContent = `Background (${background ? 1 : 0})`;
    const controls = document.createElement('div'); controls.className = 'pointlesh-scene-group-controls';
    const eye = button(`${background?.visible ? 'Hide' : 'Show'} background`, background?.visible ? '👁' : '○', () => toggleBackground(sceneId, 'visible'));
    const lock = lockButton('background', !!background?.locked, () => toggleBackground(sceneId, 'locked'));
    eye.disabled = lock.disabled = !background;
    controls.append(eye, lock);
    if (!background) controls.append(button('Add background', '+ Add', () => editBackground(sceneId)));
    heading.append(title, controls); section.append(heading);
    if (background) {
      const row = document.createElement('div'); row.className = 'scene-designer__item pointlesh-scene-background';
      const preview = assetPreviewUrl?.(background.assetId);
      if (preview) { const image = document.createElement('img'); image.src = preview; image.alt = ''; row.append(image); }
      const name = document.createElement('div'); name.className = 'scene-designer__item-title'; name.textContent = background.assetId;
      const edit = button('Edit background', 'Edit', () => editBackground(sceneId)); edit.disabled = background.locked;
      row.append(name, edit);
      section.append(row);
    }
    return section;
  }
  function button(label: string, text: string, action: () => void) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'scene-designer__button';
    node.textContent = text; node.title = label; node.setAttribute('aria-label', label);
    node.addEventListener('click', event => { event.stopPropagation(); action(); }); return node;
  }
  function lockButton(name: string, locked: boolean, action: () => void) {
    const node = button(`${locked ? 'Unlock' : 'Lock'} ${name}`, locked ? '🔒 Locked' : '🔓', action);
    node.classList.add('pointlesh-scene-lock');
    node.dataset.locked = String(locked);
    node.setAttribute('aria-pressed', String(locked));
    return node;
  }
  function targetLayer(sceneId: string, kind: SceneGroupKind, manifest = designer.getManifest()): SceneLayer | undefined {
    const scene = manifest.scenes[sceneId];
    if (!scene) return;
    const selected = designer.getSelection();
    return scene.layers.find(layer => !layer.locked && layer.id === (selected && 'layerId' in selected ? selected.layerId : ''))
      ?? sceneGroupItems(manifest, sceneId).find(item => item.kind === kind && !item.layer.locked)?.layer
      ?? scene.layers.find(layer => !layer.locked);
  }
  function addPrefab(sceneId: string, kind: 'character' | 'object' | 'point') {
    const manifest = designer.getManifest();
    const choices = Object.values(manifest.prefabs ?? {}).filter(prefab => isPointleshPrefab(prefab) && prefab.pointlesh.kind === kind && !isPrefabTemplate(prefab));
    const template = Object.values(manifest.prefabs ?? {}).find(prefab => isPointleshPrefab(prefab) && prefab.pointlesh.kind === kind && isPrefabTemplate(prefab));
    if (!choices.length && !template) return;
    const dialog = document.createElement('dialog'); dialog.className = 'scene-designer__dialog pointlesh-add-scene-item';
    dialog.setAttribute('aria-label', `Add ${kind}`);
    const form = document.createElement('form'); form.className = 'scene-designer__stack';
    const title = document.createElement('strong'); title.textContent = `Add ${kind}`;
    const select = document.createElement('select'); select.className = 'scene-designer__select'; select.setAttribute('aria-label', `Choose ${kind}`);
    for (const prefab of choices) { const option = document.createElement('option'); option.value = prefab.id; option.textContent = prefab.name; select.append(option); }
    if (template) { const option = document.createElement('option'); option.value = '__new__'; option.textContent = `New ${kind} prefab…`; select.append(option); }
    const name = document.createElement('input'); name.className = 'scene-designer__input'; name.setAttribute('aria-label', `New ${kind} name`); name.placeholder = 'Name';
    const updateNew = () => { name.hidden = select.value !== '__new__'; name.required = !name.hidden; };
    select.addEventListener('change', updateNew); updateNew();
    const actions = document.createElement('div'); actions.className = 'scene-designer__dialog-actions';
    const cancel = button('Cancel', 'Cancel', () => dialog.close());
    const add = document.createElement('button'); add.type = 'submit'; add.className = 'scene-designer__button'; add.textContent = 'Add';
    actions.append(cancel, add); form.append(title, select, name, actions); dialog.append(form); designer.root.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', event => {
      event.preventDefault(); const next = designer.getManifest(), layer = targetLayer(sceneId, kind, next);
      let prefab = next.prefabs?.[select.value];
      if (select.value === '__new__' && template && isPointleshPrefab(template)) {
        const newName = name.value.trim(); if (!newName) { name.focus(); return; }
        const id = `prefab.${crypto.randomUUID()}`;
        prefab = extendPointleshPrefab(template, { id, name: newName, editor: { folderPath: [groups.find(group => group.kind === kind)!.title] }, properties: { label: newName } });
        next.prefabs ??= {}; next.prefabs[id] = prefab;
      }
      if (!layer || !prefab || !isPointleshPrefab(prefab) || prefab.pointlesh.kind !== kind) return;
      const instance = createPointleshInstance({ prefabId: prefab.id, name: prefab.name });
      layer.prefabs ??= []; layer.prefabs.push(instance);
      commit(next); dialog.close();
      designer.select({ type: 'prefab', sceneId, layerId: layer.id, instanceId: instance.id }); designer.setMode('select');
    });
    dialog.showModal();
  }
  function toggleGroup(sceneId: string, kind: SceneGroupKind, property: 'visible' | 'locked') {
    const next = designer.getManifest(), items = sceneGroupItems(next, sceneId).filter(item => item.kind === kind);
    if (!items.length) return;
    const key = `${sceneId}:${kind}:${property}`;
    const saved = previous.get(key);
    const turnOff = property === 'visible' ? items.some(item => item.entity.visible) : items.some(item => !item.entity.locked);
    if (turnOff) {
      previous.set(key, new Map(items.map(item => [item.id, item.entity[property]])));
      for (const item of items) item.entity[property] = property === 'locked';
    } else {
      for (const item of items) item.entity[property] = saved?.get(item.id) ?? (property === 'visible');
      previous.delete(key);
    }
    commit(next);
  }
  function select(sceneId: string, item: Item) {
    designer.select(item.source === 'prefab' ? { type: 'prefab', sceneId, layerId: item.layer.id, instanceId: item.id }
      : item.source === 'object' ? { type: 'object', sceneId, layerId: item.layer.id, objectId: item.id }
      : { type: 'area', sceneId, layerId: item.layer.id, areaId: item.id });
    designer.setMode('select');
  }
  function updateItem(sceneId: string, item: Item, property: 'visible' | 'locked') {
    const next = designer.getManifest(), current = sceneGroupItems(next, sceneId).find(candidate => candidate.id === item.id && candidate.layer.id === item.layer.id);
    if (!current) return;
    current.entity[property] = !current.entity[property]; commit(next);
  }
  function removeItem(sceneId: string, item: Item) {
    const next = designer.getManifest(), layer = next.scenes[sceneId]?.layers.find(layer => layer.id === item.layer.id);
    if (!layer) return;
    if (item.source === 'prefab') layer.prefabs = layer.prefabs?.filter(entity => entity.id !== item.id);
    else if (item.source === 'object') layer.objects = layer.objects.filter(entity => entity.id !== item.id);
    else layer.areas = layer.areas.filter(entity => entity.id !== item.id);
    commit(next);
    designer.select({ type: 'layer', sceneId, layerId: layer.id });
  }
  function sync(manifest: SceneDesignerManifest) {
    const sceneId = designer.getSceneId();
    const panel = designer.root.querySelector<HTMLElement>('.scene-designer__panel[data-panel="scenes"]');
    const list = panel?.querySelector<HTMLElement>(':scope > .scene-designer__section:nth-child(3)');
    if (!list || !manifest.scenes[sceneId]) return;
    // Native Scene Designer rebuilds its layer list after each edit. Replace
    // that view, rather than hide it, so duplicate rows cannot receive clicks.
    if (list.childElementCount !== 1 || list.firstElementChild !== root) list.replaceChildren(root);
    const selection = designer.getSelection();
    const key = JSON.stringify([sceneId, sceneBackground(manifest.scenes[sceneId]), manifest.scenes[sceneId].layers, selection]);
    if (key === renderedKey) return;
    renderedKey = key; root.replaceChildren(renderBackground(sceneId, manifest));
    const items = sceneGroupItems(manifest, sceneId);
    for (const group of groups) {
      const subset = items.filter(item => item.kind === group.kind);
      const section = document.createElement('section'); section.className = 'pointlesh-scene-group'; section.setAttribute('aria-label', group.title);
      const heading = document.createElement('div'); heading.className = 'scene-designer__subhead';
      const title = document.createElement('span'); title.textContent = `${group.title} (${subset.length})`;
      const controls = document.createElement('div'); controls.className = 'pointlesh-scene-group-controls';
      const visible = subset.some(item => item.entity.visible);
      const locked = subset.length > 0 && subset.every(item => item.entity.locked);
      const eye = button(`${visible ? 'Hide' : 'Show'} ${group.title.toLowerCase()}`, visible ? '👁' : '○', () => toggleGroup(sceneId, group.kind, 'visible'));
      const lock = lockButton(group.title.toLowerCase(), locked, () => toggleGroup(sceneId, group.kind, 'locked'));
      eye.disabled = lock.disabled = !subset.length;
      const add = button(`Add ${group.kind}`, '+ Add', () => {
        if (group.kind === 'area' || group.kind === 'hotspot') {
          const layer = targetLayer(sceneId, group.kind); if (layer) addArea(sceneId, layer.id, group.kind);
        } else addPrefab(sceneId, group.kind);
      });
      add.disabled = !targetLayer(sceneId, group.kind) || (group.kind !== 'area' && group.kind !== 'hotspot'
        && !Object.values(manifest.prefabs ?? {}).some(prefab => isPointleshPrefab(prefab) && prefab.pointlesh.kind === group.kind));
      controls.append(eye, lock, add); heading.append(title, controls); section.append(heading);
      for (const item of subset) {
        const row = document.createElement('div'); row.className = 'scene-designer__item'; row.setAttribute('role', 'button'); row.tabIndex = 0;
        const selected = selection && ('instanceId' in selection ? selection.instanceId : 'objectId' in selection ? selection.objectId : 'areaId' in selection ? selection.areaId : '') === item.id;
        row.setAttribute('aria-selected', String(!!selected)); row.setAttribute('aria-label', `Select ${item.name}`);
        row.addEventListener('click', () => select(sceneId, item));
        row.addEventListener('keydown', event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(sceneId, item); } });
        const name = document.createElement('div'); name.className = 'scene-designer__item-title'; name.textContent = item.name;
        row.append(name, button(`${item.entity.visible ? 'Hide' : 'Show'} ${item.name}`, item.entity.visible ? '👁' : '○', () => updateItem(sceneId, item, 'visible')),
          lockButton(item.name, item.entity.locked, () => updateItem(sceneId, item, 'locked')),
          button(`Remove ${item.name}`, '×', () => removeItem(sceneId, item)));
        section.append(row);
      }
      root.append(section);
    }
  }
  const style = document.createElement('style'); style.textContent = `
    .pointlesh-scene-groups{display:grid;gap:12px}
    .pointlesh-scene-group .scene-designer__subhead{align-items:center;gap:8px}
    .pointlesh-scene-group-controls{display:flex;align-items:center;gap:3px}
    .pointlesh-scene-group-controls .scene-designer__button{padding:3px 7px;white-space:nowrap}
    .pointlesh-scene-lock[data-locked="true"]{background:#793a3a;color:#fff0e8;border-color:#d87e6e;font-weight:700}
    .pointlesh-scene-lock[data-locked="false"]{background:transparent;color:#afc8e7;border-color:#627791}
    .pointlesh-scene-lock[data-locked="true"]:hover{background:#934747}
    .pointlesh-scene-group .scene-designer__item-title{min-width:0;overflow-wrap:anywhere}
    .pointlesh-scene-background img{width:52px;height:32px;object-fit:cover;flex:none;border:1px solid #566071}
  `; designer.root.append(style);
  return { sync, invalidate() { renderedKey = ''; }, destroy() { root.remove(); style.remove(); designer.root.querySelector<HTMLDialogElement>('.pointlesh-add-scene-item,.pointlesh-scene-background-dialog')?.close(); } };
}
