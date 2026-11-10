import { createPointleshArea } from '@pointlesh/core';
import type { SceneArea, SceneDesignerManifest } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';

/** Create scene-owned polygons using Scene Designer’s native drawing tools. */
export function installSceneAreas(designer: SceneDesigner, commit: (manifest: SceneDesignerManifest) => void) {
  const document = designer.root.ownerDocument;
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
  return { add, destroy() {
    designer.root.querySelector<HTMLDialogElement>('.pointlesh-new-area')?.close();
  } };
}
