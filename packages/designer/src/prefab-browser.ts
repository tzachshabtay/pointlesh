import { extendPointleshPrefab, isPointleshPrefab, type PointleshPrefabDefinition } from '@pointlesh/core';
import type { SceneDesignerManifest, ScenePrefabDefinition } from '@scene-designer/core';
import type { SceneDesigner } from '@scene-designer/designer';

const categories = ['Characters', 'Objects'];
const isReusable = (prefab: ScenePrefabDefinition) => !isPointleshPrefab(prefab) || ['character', 'object'].includes(prefab.pointlesh.kind);
export function isPrefabTemplate(prefab: ScenePrefabDefinition): boolean {
  return isPointleshPrefab(prefab) && (prefab.pointlesh.editor?.template ?? prefab.id === `pointlesh.${prefab.pointlesh.kind}`);
}
export function prefabFolderPath(prefab: ScenePrefabDefinition): string[] {
  if (!isPointleshPrefab(prefab)) return ['Other'];
  const path = prefab.pointlesh.editor?.folderPath;
  if (path?.length) return [...path];
  const kind = prefab.pointlesh.kind;
  return [kind === 'character' ? 'Characters' : kind === 'object' ? 'Objects' : kind === 'hotspot' ? 'Hotspots' : 'Areas'];
}
const samePath = (a: string[], b: string[]) => a.length === b.length && a.every((part, index) => part === b[index]);

/** Folder navigation over native definitions; selections still use Scene Designer. */
export function installPrefabBrowser(designer: SceneDesigner, commit: (manifest: SceneDesignerManifest) => void) {
  const document = designer.root.ownerDocument;
  const browser = document.createElement('section');
  browser.className = 'pointlesh-prefab-browser'; browser.setAttribute('aria-label', 'Prefab browser');
  let path: string[] = [], selected: string | undefined, observedId = designer.getSelectedPrefabId();
  let cachedManifest: SceneDesignerManifest | undefined, catalog: ScenePrefabDefinition[] = [];
  let renderedKey = '';
  const pickers = new Map<HTMLDialogElement, { root: HTMLElement; select: HTMLSelectElement; path: string[]; selected?: string; key: string }>();

  function button(label: string, action: () => void, className = 'scene-designer__asset-chip') {
    const node = document.createElement('button'); node.type = 'button'; node.className = className;
    node.textContent = label; node.setAttribute('aria-label', label); node.addEventListener('click', action); return node;
  }
  function navigate(next: string[]) { path = next; selected = undefined; renderedKey = ''; sync(designer.getManifest()); }
  function reveal(id: string) {
    const prefab = designer.getManifest().prefabs?.[id];
    if (!prefab || !isReusable(prefab) || isPrefabTemplate(prefab)) return;
    path = prefabFolderPath(prefab); selected = id; observedId = id; renderedKey = '';
    designer.select({ type: 'prefab-definition', prefabId: id });
    sync(designer.getManifest());
  }
  function navigation(target: HTMLElement, current: string[], selectedId: string | undefined, go: (path: string[]) => void, choose: (id: string) => void) {
    const crumbs = document.createElement('nav'); crumbs.className = 'scene-designer__asset-breadcrumbs';
    crumbs.setAttribute('aria-label', 'Prefab breadcrumbs');
    crumbs.append(button('Prefabs', () => go([])));
    current.forEach((part, index) => crumbs.append(button(part, () => go(current.slice(0, index + 1)))));
    const chosen = catalog.find(prefab => prefab.id === selectedId);
    if (chosen) {
      const name = document.createElement('span'); name.textContent = chosen.name; name.setAttribute('aria-current', 'page'); crumbs.append(name);
    }
    target.replaceChildren(crumbs);
    if (chosen) return;
    const list = document.createElement('div'); list.className = 'scene-designer__asset-list pointlesh-prefab-list';
    const folders = new Set<string>(current.length ? [] : categories);
    for (const prefab of catalog) {
      const folder = prefabFolderPath(prefab);
      if (samePath(folder.slice(0, current.length), current) && folder.length > current.length) folders.add(folder[current.length]!);
    }
    for (const folder of [...folders].sort()) {
      const item = button(folder, () => go([...current, folder]));
      item.dataset.folder = 'true'; item.setAttribute('aria-label', `Open ${folder} folder`); list.append(item);
    }
    for (const prefab of catalog.filter(prefab => samePath(prefabFolderPath(prefab), current))) {
      const item = button(prefab.name, () => choose(prefab.id));
      item.dataset.prefabId = prefab.id; list.append(item);
    }
    if (!list.childElementCount) {
      const empty = document.createElement('p'); empty.className = 'scene-designer__empty'; empty.textContent = 'No prefabs in this folder yet.'; list.append(empty);
    }
    target.append(list);
  }
  function createDialog() {
    const manifest = designer.getManifest();
    const templates = Object.values(manifest.prefabs ?? {}).filter(prefab => isReusable(prefab) && isPrefabTemplate(prefab)) as PointleshPrefabDefinition[];
    if (!templates.length) return;
    const dialog = document.createElement('dialog'); dialog.className = 'scene-designer__dialog pointlesh-new-prefab'; dialog.setAttribute('aria-label', 'New prefab');
    const form = document.createElement('form'); form.className = 'scene-designer__stack';
    const title = document.createElement('strong'); title.textContent = 'New prefab';
    const type = document.createElement('select'); type.className = 'scene-designer__select'; type.setAttribute('aria-label', 'Prefab type');
    for (const template of templates) {
      const option = document.createElement('option'); option.value = template.id; option.textContent = template.name; type.append(option);
    }
    type.value = templates.find(template => prefabFolderPath(template)[0] === path[0])?.id ?? templates[0]!.id;
    const name = document.createElement('input'); name.className = 'scene-designer__input'; name.placeholder = 'Name'; name.setAttribute('aria-label', 'Prefab name'); name.required = true;
    const error = document.createElement('p'); error.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'scene-designer__dialog-actions';
    const cancel = button('Cancel', () => dialog.close());
    const create = document.createElement('button'); create.type = 'submit'; create.className = 'scene-designer__button'; create.textContent = 'Create';
    actions.append(cancel, create); form.append(title, type, name, error, actions); dialog.append(form); designer.root.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const next = designer.getManifest(), base = next.prefabs?.[type.value];
        if (!base || !isPointleshPrefab(base)) throw new Error('This prefab type is no longer available.');
        if (!name.value.trim()) { name.focus(); return; }
        const folderPath = prefabFolderPath(base)[0] === path[0] ? path : prefabFolderPath(base);
        const id = `prefab.${crypto.randomUUID()}`;
        next.prefabs ??= {};
        next.prefabs[id] = extendPointleshPrefab(base, { id, name: name.value.trim(), editor: { folderPath }, properties: { label: name.value.trim() } });
        commit(next); dialog.close(); reveal(id);
      } catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
    });
    dialog.showModal(); name.focus();
  }
  function sync(manifest: SceneDesignerManifest) {
    if (manifest !== cachedManifest) {
      cachedManifest = manifest;
      catalog = Object.values(manifest.prefabs ?? {}).filter(prefab => isReusable(prefab) && !isPrefabTemplate(prefab)).sort((a, b) => a.name.localeCompare(b.name));
    }
    const nativeId = designer.getSelectedPrefabId();
    if (nativeId !== observedId) {
      observedId = nativeId;
      const prefab = catalog.find(prefab => prefab.id === nativeId);
      selected = prefab?.id;
      if (prefab) path = prefabFolderPath(prefab);
    }
    if (selected && !catalog.some(prefab => prefab.id === selected)) selected = undefined;
    const panel = designer.root.querySelector<HTMLElement>('.scene-designer__panel[data-panel="prefabs"]');
    const section = panel?.querySelector<HTMLElement>(':scope > .scene-designer__section');
    const nativeSelect = section?.querySelector<HTMLSelectElement>(':scope > select');
    const editor = panel?.querySelector<HTMLElement>(':scope > .scene-designer__editor');
    if (nativeSelect) nativeSelect.hidden = true;
    if (section && browser.parentElement !== section) section.append(browser);
    if (editor) editor.toggleAttribute('data-pointlesh-browsing', !selected);
    const key = JSON.stringify([path, selected, catalog.map(prefab => [prefab.id, prefab.name, prefabFolderPath(prefab)])]);
    if (key !== renderedKey) {
      renderedKey = key;
      navigation(browser, path, selected, navigate, reveal);
      if (Object.values(manifest.prefabs ?? {}).some(prefab => isReusable(prefab) && isPrefabTemplate(prefab))) browser.append(button('New prefab', createDialog, 'scene-designer__button'));
    }
    // The native Add Prefab dialog retains its placement/shape-drawing behavior.
    // Only replace its flat catalog chooser, using the same folder navigation.
    for (const dialog of designer.root.querySelectorAll<HTMLDialogElement>('dialog.scene-designer__dialog:not(.pointlesh-new-prefab)')) {
      const select = dialog.querySelector<HTMLSelectElement>('select');
      if (!select || ![...select.options].some(option => manifest.prefabs?.[option.value])) continue;
      let picker = pickers.get(dialog);
      if (!picker) {
        const root = document.createElement('section'); root.className = 'pointlesh-prefab-browser'; root.setAttribute('aria-label', 'Choose prefab');
        select.parentElement!.hidden = true; select.parentElement!.after(root);
        picker = { root, select, path: [], key: '' }; pickers.set(dialog, picker);
      }
      const state = picker;
      const pickerKey = JSON.stringify([key, state.path, state.selected]);
      if (state.key !== pickerKey) {
        state.key = pickerKey;
        navigation(state.root, state.path, state.selected,
          next => { state.path = next; state.selected = undefined; state.key = ''; sync(designer.getManifest()); },
          id => { state.selected = id; state.select.value = id; state.key = ''; sync(designer.getManifest()); });
        const add = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.value === 'add');
        if (add) add.disabled = !catalog.some(prefab => prefab.id === state.selected);
      }
    }
    for (const dialog of pickers.keys()) if (!dialog.isConnected) pickers.delete(dialog);
  }
  const style = document.createElement('style');
  style.textContent = `
    .scene-designer__editor[data-pointlesh-browsing]{display:none!important}
    .pointlesh-prefab-browser{display:grid;gap:10px}
    .pointlesh-prefab-browser [hidden]{display:none!important}
    .pointlesh-prefab-browser nav{align-items:center;gap:5px}
    .pointlesh-prefab-browser nav>*+*::before{content:'›';margin-right:6px;color:var(--sd-muted)}
    .pointlesh-prefab-browser [aria-current]{font-size:12px;color:var(--sd-text)}
    .pointlesh-prefab-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:280px;overflow:auto}
    .pointlesh-prefab-list button{text-align:left;overflow-wrap:anywhere}
    .pointlesh-prefab-list [data-folder]::before{content:'▱';margin-right:7px;color:var(--sd-accent)}
    .pointlesh-prefab-list .scene-designer__empty{grid-column:1/-1}
  `;
  designer.root.append(style);
  return {
    sync, reveal, isEditing: () => !!selected,
    destroy() {
      browser.remove(); style.remove();
      designer.root.querySelector('.scene-designer__editor[data-pointlesh-browsing]')?.removeAttribute('data-pointlesh-browsing');
      const select = designer.root.querySelector<HTMLSelectElement>('.scene-designer__panel[data-panel="prefabs"] > .scene-designer__section > select');
      if (select) select.hidden = false;
      for (const [dialog, picker] of pickers) { picker.root.remove(); picker.select.parentElement!.hidden = false; dialog.close('cancel'); }
      designer.root.querySelector<HTMLDialogElement>('.pointlesh-new-prefab')?.close();
    },
  };
}
