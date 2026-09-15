import { createPointleshArea, isPointleshArea } from '@pointlesh/core';
import type { SceneArea, SceneDesignerManifest } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';

/** Restore native scene-owned polygons alongside prefab instances. */
export function installSceneAreas(designer: SceneDesigner, commit: (manifest: SceneDesignerManifest) => void) {
  const document = designer.root.ownerDocument;
  const keys = new WeakMap<HTMLElement, string>();
  function button(label: string, action: () => void, text = label) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'scene-designer__button';
    node.textContent = text; node.setAttribute('aria-label', label); node.title = label; node.addEventListener('click', event => { event.stopPropagation(); action(); }); return node;
  }
  function select(sceneId: string, layerId: string, area: SceneArea) {
    designer.select({ type: 'area', sceneId, layerId, areaId: area.id });
    designer.setMode(area.closed && area.vertices.length ? 'select' : 'area-draw');
  }
  function add(sceneId: string, layerId: string, kind: 'area' | 'hotspot') {
    const dialog = document.createElement('dialog'); dialog.className = 'scene-designer__dialog pointlesh-new-area';
    const title = kind === 'area' ? 'New area' : 'New hotspot'; dialog.setAttribute('aria-label', title);
    const form = document.createElement('form'); form.className = 'scene-designer__stack';
    const heading = document.createElement('strong'); heading.textContent = title;
    const name = document.createElement('input'); name.className = 'scene-designer__input'; name.required = true;
    name.setAttribute('aria-label', 'Name'); name.value = kind === 'area' ? 'Area' : 'Hotspot';
    const actions = document.createElement('div'); actions.className = 'scene-designer__dialog-actions';
    const create = document.createElement('button'); create.type = 'submit'; create.className = 'scene-designer__button'; create.textContent = 'Draw shape';
    actions.append(button('Cancel', () => dialog.close()), create); form.append(heading, name, actions); dialog.append(form); designer.root.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!name.value.trim()) return;
      const manifest = designer.getManifest(), layer = manifest.scenes[sceneId]?.layers.find(layer => layer.id === layerId);
      if (!layer) { dialog.close(); return; }
      const area = createPointleshArea({ id: `${kind}.${crypto.randomUUID()}`, kind, name: name.value.trim() });
      layer.areas.push(area); commit(manifest); dialog.close(); select(sceneId, layerId, area);
    });
    dialog.showModal(); name.select();
  }
  function sync(manifest: SceneDesignerManifest) {
    const scene = manifest.scenes[designer.getSceneId()]; if (!scene) return;
    const bodies = designer.root.querySelectorAll<HTMLElement>('.scene-designer__panel[data-panel="scenes"] .scene-designer__layer-body');
    bodies.forEach((body, index) => {
      const layer = scene.layers[index]; if (!layer) return;
      const selection = designer.getSelection();
      const key = JSON.stringify([scene.id, layer.id, layer.areas, selection]);
      if (keys.get(body) === key) return;
      keys.set(body, key);
      body.querySelector(':scope > .pointlesh-scene-areas')?.remove();
      // Without prefabs, upstream already renders a generic native area list.
      // Replace that one list with typed sections, retaining non-Pointlesh areas.
      for (const child of body.children) if (child.querySelector(':scope > .scene-designer__subhead > span')?.textContent === 'Areas') {
        (child as HTMLElement).hidden = true; child.setAttribute('data-pointlesh-native-areas', '');
      }
      const root = document.createElement('div'); root.className = 'pointlesh-scene-areas';
      const groups = [
        { title: 'Areas', kind: 'area' as const, areas: layer.areas.filter(area => isPointleshArea(area) && area.pointlesh.kind !== 'hotspot') },
        { title: 'Hotspots', kind: 'hotspot' as const, areas: layer.areas.filter(area => isPointleshArea(area) && area.pointlesh.kind === 'hotspot') },
        { title: 'Other areas', kind: undefined, areas: layer.areas.filter(area => !isPointleshArea(area)) },
      ];
      for (const group of groups) {
        if (!group.kind && !group.areas.length) continue;
        const section = document.createElement('section'); section.setAttribute('aria-label', `${group.title} in ${layer.name}`);
        const header = document.createElement('div'); header.className = 'scene-designer__subhead';
        const title = document.createElement('span'); title.textContent = group.title; header.append(title);
        if (group.kind) header.append(button(`Add ${group.kind}`, () => add(scene.id, layer.id, group.kind!)));
        section.append(header);
        for (const area of group.areas) {
          const item = document.createElement('div'); item.className = 'scene-designer__item'; item.tabIndex = 0; item.setAttribute('role', 'button');
          const name = isPointleshArea(area) ? area.pointlesh.name : area.tag || 'Area';
          item.setAttribute('aria-label', `Select ${name}`);
          item.setAttribute('aria-selected', String(!!selection && 'areaId' in selection && selection.areaId === area.id));
          item.addEventListener('click', () => select(scene.id, layer.id, area));
          item.addEventListener('keydown', event => { if (event.target === item && ['Enter', ' '].includes(event.key)) { event.preventDefault(); select(scene.id, layer.id, area); } });
          const title = document.createElement('div'); title.className = 'scene-designer__item-title'; title.textContent = name;
          const update = (patch?: Partial<SceneArea>) => {
            const next = designer.getManifest(), target = next.scenes[scene.id]?.layers.find(candidate => candidate.id === layer.id);
            const current = target?.areas.find(candidate => candidate.id === area.id); if (!target || !current) return;
            if (patch) Object.assign(current, patch); else target.areas = target.areas.filter(candidate => candidate.id !== area.id);
            commit(next);
            if (!patch) designer.select({ type: 'layer', sceneId: scene.id, layerId: layer.id });
          };
          item.append(title, button(area.visible ? 'Hide area' : 'Show area', () => update({ visible: !area.visible }), area.visible ? '👁️' : '🙈'),
            button(area.locked ? 'Unlock area' : 'Lock area', () => update({ locked: !area.locked }), area.locked ? '🔒' : '🔓'), button('Remove area', () => update(), '×'));
          section.append(item);
        }
        root.append(section);
      }
      body.append(root);
    });
  }
  const style = document.createElement('style'); style.textContent = '.pointlesh-scene-areas .scene-designer__item-title{min-width:0;overflow-wrap:anywhere}[data-pointlesh-native-areas]{display:none!important}';
  designer.root.append(style);
  return { sync, destroy() {
    style.remove();
    designer.root.querySelectorAll('.pointlesh-scene-areas').forEach(node => node.remove());
    designer.root.querySelectorAll<HTMLElement>('[data-pointlesh-native-areas]').forEach(node => { node.hidden = false; node.removeAttribute('data-pointlesh-native-areas'); });
    designer.root.querySelector<HTMLDialogElement>('.pointlesh-new-area')?.close();
  } };
}
