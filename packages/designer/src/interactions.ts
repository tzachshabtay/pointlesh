import { registerInGameDesignerPanel, type AiAssetManifest } from '@ai-game-assets/core';
import { assertInteractionManifest, DEFAULT_INTERACTION_TARGET, interactionSentences, interactionTargets, itemInteractionColumn, syncInteractionVoiceLines, verbInteractionColumn, type InteractionManifest, type InteractionTarget, type InteractionSpeechMode } from '@pointlesh/core';
import type { SceneDesignerManifest } from '@scene-designer/core';

export class InteractionDesignerDebugClient {
  constructor(readonly baseUrl = 'http://127.0.0.1:4290') {}
  async promote(manifest: InteractionManifest): Promise<InteractionManifest> {
    const response = await fetch(`${this.baseUrl}/manifest`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest) });
    if (!response.ok) throw new Error(await response.text());
    const result: unknown = await response.json(); assertInteractionManifest(result); return result;
  }
}
export type InteractionDesignerOptions = {
  manifest: InteractionManifest;
  getScenes(): SceneDesignerManifest;
  getAiAssets(): AiAssetManifest;
  onChange(manifest: InteractionManifest, assets: AiAssetManifest): void;
  client?: Pick<InteractionDesignerDebugClient, 'promote'>;
  storageKey?: string;
  mount?: HTMLElement;
};
export type InteractionDesigner = ReturnType<typeof installInteractionDesigner>;

/** Engine-neutral matrix using the same movable/resizable designer dock as Assets and Scenes. */
export function installInteractionDesigner(options: InteractionDesignerOptions) {
  assertInteractionManifest(options.manifest);
  const document = (options.mount ?? globalThis.document.body).ownerDocument;
  let manifest = structuredClone(options.manifest), base = JSON.stringify(options.manifest), destroyed = false;
  let rows: InteractionTarget[] = [], interactiveRows: InteractionTarget[] = [], filter = '', kind = '', dirty = false;
  const past: InteractionManifest[] = [], future: InteractionManifest[] = [];
  const root = document.createElement('section'); root.className = 'pointlesh-interactions'; root.setAttribute('aria-label', 'Interaction designer');
  const style = document.createElement('style'); style.textContent = styles; root.append(style);
  const title = document.createElement('header'); title.className = 'pointlesh-interactions-title';
  const heading = document.createElement('h2'); heading.textContent = 'Interactions'; title.append(heading);
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  const makeButton = (text: string, action: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; return b; };
  const promote = makeButton('Promote', () => { void promoteChanges(); }); title.append(status); root.append(title);
  const tools = document.createElement('div'); tools.className = 'pointlesh-interactions-tools';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Find a target or room…'; search.setAttribute('aria-label', 'Find interaction target');
  search.oninput = () => { filter = search.value.toLowerCase(); renderTable(); };
  const kinds = document.createElement('select'); kinds.setAttribute('aria-label', 'Interaction target type');
  for (const [value, label] of [['', 'All targets'], ['character', 'Characters'], ['object', 'Objects'], ['hotspot', 'Hotspots'], ['inventory-item', 'Inventory items']]) kinds.add(new Option(label, value));
  kinds.onchange = () => { kind = kinds.value; renderTable(); };
  const undo = makeButton('Undo', () => history(false)), redo = makeButton('Redo', () => history(true));
  const exportButton = makeButton('Export JSON', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'interactions.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  tools.append(search, kinds, undo, redo, exportButton, promote); root.append(tools);
  const legend = document.createElement('p'); legend.className = 'pointlesh-interactions-legend';
  legend.innerHTML = '<span>Empty · use Defaults</span><span>★ Game code</span><span class="simple">✓ Hero speech</span><span class="impossible">✕ Should not happen · use Defaults</span>';
  root.append(legend);
  const scroll = document.createElement('div'); scroll.className = 'pointlesh-interactions-scroll'; root.append(scroll);
  const count = document.createElement('p'); count.className = 'pointlesh-interactions-count'; root.append(count);
  (options.mount ?? document.body).append(root);
  const dialog = document.createElement('dialog'); dialog.className = 'pointlesh-interaction-edit'; dialog.setAttribute('aria-label', 'Edit interaction'); root.append(dialog);
  const dock = registerInGameDesignerPanel({ id: 'pointlesh.interactions', label: 'Interactions', ariaLabel: 'Toggle interaction designer', panel: root, dragHandle: title, order: 50,
    onOpenChange(open) { if (open) render(); else dialog.close(); } });
  try {
    const saved = options.storageKey && document.defaultView!.localStorage.getItem(options.storageKey);
    if (saved) { const draft = JSON.parse(saved); if (draft.base === base) { assertInteractionManifest(draft.manifest); manifest = draft.manifest; dirty = true; } }
  } catch { status.textContent = 'Could not restore the interaction draft.'; }
  function publish() {
    const assets = syncInteractionVoiceLines(manifest, options.getAiAssets(), rows);
    options.onChange(structuredClone(manifest), assets);
    if (options.storageKey) try { document.defaultView!.localStorage.setItem(options.storageKey, JSON.stringify({ base, manifest })); }
    catch { status.textContent = 'Draft storage is unavailable. Export or promote to keep edits.'; }
  }
  function change(next: InteractionManifest) {
    assertInteractionManifest(next);
    past.push(structuredClone(manifest)); if (past.length > 100) past.shift(); future.length = 0;
    manifest = next; dirty = true; publish(); render();
  }
  function history(forward: boolean) {
    const next = (forward ? future : past).pop(); if (!next) return;
    (forward ? past : future).push(manifest); manifest = next; dirty = true; publish(); render();
  }
  async function promoteChanges() {
    const snapshot = structuredClone(manifest); promote.disabled = true; status.textContent = 'Promoting…';
    try {
      const result = await (options.client ?? new InteractionDesignerDebugClient()).promote(snapshot);
      base = JSON.stringify(result);
      dirty = JSON.stringify(manifest) !== base;
      if (!dirty && options.storageKey) document.defaultView!.localStorage.removeItem(options.storageKey);
      else publish();
      status.textContent = dirty ? 'Promoted; newer edits remain a draft.' : 'Promoted with linked voice lines.';
    } catch (error) { status.textContent = `Draft kept. ${error instanceof Error ? error.message : String(error)}`; }
    finally { promote.disabled = false; }
  }
  function render() {
    if (destroyed) return;
    const scenes = options.getScenes();
    rows = interactionTargets(scenes);
    interactiveRows = interactionTargets(scenes, { interactiveOnly: true });
    undo.disabled = !past.length; redo.disabled = !future.length;
    renderTable();
  }
  function renderTable() {
    const columns = [...manifest.verbs.map(verb => ({ id: verbInteractionColumn(verb.id), name: verb.label, type: 'Verb' })),
      ...rows.filter(row => row.kind === 'inventory-item').map(row => ({ id: itemInteractionColumn(row.id.slice('prefab:'.length)), name: row.name, type: 'Inventory' }))];
    const table = document.createElement('table'); table.setAttribute('aria-label', 'Game interactions');
    const head = table.createTHead().insertRow(); const corner = document.createElement('th'); corner.scope = 'col'; corner.textContent = 'Target'; head.append(corner);
    for (const column of columns) { const th = document.createElement('th'); th.scope = 'col'; const label = document.createElement('span'); label.textContent = column.name;
      const small = document.createElement('small'); small.textContent = column.type; th.append(label, small); head.append(th); }
    const body = table.createTBody();
    const visible = interactiveRows.filter(row => (!kind || row.kind === kind) && `${row.name} ${row.locations.map(location => location.sceneName).join(' ')}`.toLowerCase().includes(filter));
    const defaults: InteractionTarget = { id: DEFAULT_INTERACTION_TARGET, name: 'Defaults', kind: 'object', properties: {}, locations: [] };
    for (const row of [defaults, ...visible]) {
      const tr = body.insertRow(), th = document.createElement('th'); th.scope = 'row';
      if (row.id === DEFAULT_INTERACTION_TARGET) tr.className = 'pointlesh-interaction-defaults';
      const name = document.createElement('span'); name.textContent = row.name;
      const detail = document.createElement('small'); detail.textContent = row.id === DEFAULT_INTERACTION_TARGET ? 'Fallback for empty cells' : row.kind === 'inventory-item' ? 'Inventory item' : `${row.kind} · ${[...new Set(row.locations.map(location => location.sceneName))].join(', ')}`;
      th.append(name, detail); tr.append(th);
      for (const column of columns) {
        const cell = manifest.cells[row.id]?.[column.id], td = tr.insertCell();
        const state = cell?.kind ?? 'empty', label = state === 'code' ? 'Game code' : state === 'simple' ? 'Hero speech' : state === 'impossible' ? 'Should not happen' : 'Empty';
        const b = makeButton(state === 'code' ? '★' : state === 'simple' ? '✓' : state === 'impossible' ? '✕' : '', () => edit(row, column));
        b.className = state; b.dataset.target = row.id; b.dataset.column = column.id; b.dataset.state = state;
        b.setAttribute('aria-label', `${row.name} / ${column.name}: ${label}`); b.title = cell?.kind === 'simple' ? interactionSentences(cell).join('\n') : (!cell || cell.kind === 'impossible') && row.id !== DEFAULT_INTERACTION_TARGET ? 'Uses Defaults when assigned' : label; td.append(b);
      }
    }
    scroll.replaceChildren(table); count.textContent = `${visible.length} of ${interactiveRows.length} interactive targets · ${columns.length} actions${dirty ? ' · Local draft' : ''}`;
  }
  function edit(row: InteractionTarget, column: { id: string; name: string }) {
    const cell = manifest.cells[row.id]?.[column.id]; dialog.replaceChildren();
    const h = document.createElement('h3'); h.textContent = `${row.name} · ${column.name}`;
    const label = document.createElement('label'); label.textContent = 'Interaction state';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Interaction state');
    for (const [value, text] of [['', 'Choose a state…'], ['code', 'Game code ★'], ['simple', 'Simple speech ✓'], ['impossible', 'Should not happen ✕']]) select.add(new Option(text, value));
    select.value = cell?.kind ?? 'simple'; label.append(select);
    const speech = document.createElement('div');
    const modeLabel = document.createElement('label'); modeLabel.textContent = 'Sentence playback';
    const mode = document.createElement('select'); mode.setAttribute('aria-label', 'Sentence playback');
    for (const value of ['random', 'rotation', 'sequence']) mode.add(new Option(value[0]!.toUpperCase() + value.slice(1), value));
    mode.value = cell?.kind === 'simple' ? cell.mode ?? 'sequence' : 'sequence'; modeLabel.append(mode);
    const sentenceList = document.createElement('div'); sentenceList.className = 'pointlesh-interaction-sentences';
    const inputs: HTMLTextAreaElement[] = [];
    const addSentence = (value = '') => {
      const entry = document.createElement('div'), label = document.createElement('label'), text = document.createElement('textarea');
      const caption = document.createElement('span'); label.append(caption, text); text.rows = 2; text.value = value;
      inputs.push(text); text.oninput = () => refresh();
      const remove = makeButton('Remove', () => { inputs.splice(inputs.indexOf(text), 1); entry.remove(); refresh(); });
      entry.append(label, remove); sentenceList.append(entry); return text;
    };
    for (const value of cell?.kind === 'simple' ? interactionSentences(cell) : ['']) addSentence(value);
    speech.append(modeLabel, sentenceList, makeButton('+ Add sentence', () => { const input = addSentence(); refresh(); input.focus(); }));
    const help = document.createElement('p'); const actions = document.createElement('div'); actions.className = 'pointlesh-interaction-actions';
    const clear = makeButton('× Clear interaction', () => {
      const next = structuredClone(manifest); delete next.cells[row.id]?.[column.id];
      if (next.cells[row.id] && !Object.keys(next.cells[row.id]!).length) delete next.cells[row.id];
      change(next); dialog.close();
    });
    const apply = makeButton('Apply', () => {
      const sentences = inputs.map(input => input.value.trim());
      const next = structuredClone(manifest); (next.cells[row.id] ??= {})[column.id] = select.value === 'simple'
        ? { kind: 'simple', ...(sentences.length === 1 ? { text: sentences[0]! } : { sentences }), mode: mode.value as InteractionSpeechMode } : { kind: select.value as 'code' | 'impossible' };
      try { change(next); dialog.close(); } catch (error) { help.textContent = error instanceof Error ? error.message : String(error); }
    });
    const refresh = () => {
      speech.hidden = select.value !== 'simple'; apply.disabled = !select.value || (select.value === 'simple' && (!inputs.length || inputs.some(input => !input.value.trim())));
      inputs.forEach((input, index) => {
        input.setAttribute('aria-label', index === 0 ? 'Hero speech' : `Hero speech ${index + 1}`);
        input.previousElementSibling!.textContent = `Sentence ${index + 1}`;
        const remove = input.parentElement!.nextElementSibling as HTMLButtonElement;
        remove.disabled = inputs.length === 1; remove.setAttribute('aria-label', `Remove sentence ${index + 1}`);
      });
      const modeHelp = mode.value === 'random' ? 'Chooses one sentence at random each time.' : mode.value === 'rotation' ? 'Says the next sentence each time, wrapping back to the first.' : 'Says every sentence in order, one after another.';
      help.textContent = select.value === 'simple' ? `${modeHelp} Each sentence is linked to ${manifest.heroVoiceAssetId} in Assets → Voices.`
        : select.value === 'code' ? 'Runs the interaction handler registered by the game. This does not generate or edit code.'
        : select.value === 'impossible' ? 'Designer note only: this combination cannot occur in the game. At runtime it uses Defaults, just like an empty cell.' : 'Choose how this action should behave.';
    };
    select.onchange = refresh; mode.onchange = refresh;
    actions.append(clear, makeButton('Cancel', () => dialog.close()), apply); dialog.append(h, label, speech, help, actions); refresh(); dialog.showModal();
    if (select.value === 'simple') inputs[0]!.focus(); else select.focus();
  }
  render(); if (dirty) publish();
  return { root, open: () => dock.open(), close: () => dock.close(), isOpen: () => dock.isOpen(), refresh: render,
    getManifest: () => structuredClone(manifest), promote: promoteChanges,
    destroy() { destroyed = true; dialog.close(); dock.destroy(); root.remove(); } };
}

const styles = `
.pointlesh-interactions.ai-game-assets-in-game-designer-dock__panel:not([hidden]){display:flex!important}
.pointlesh-interactions{box-sizing:border-box;width:min(1180px,calc(100vw - 28px));height:min(760px,calc(100vh - 90px));min-width:420px;min-height:300px;display:flex;flex-direction:column;gap:12px;padding:18px;background:#141922;color:#e6eaf2;border:1px solid #465166;border-radius:10px;font:13px system-ui;overflow:hidden;resize:both}
.pointlesh-interactions *, .pointlesh-interaction-edit *{box-sizing:border-box}
.pointlesh-interactions button,.pointlesh-interactions input,.pointlesh-interactions select,.pointlesh-interactions textarea{font:inherit;color:inherit;background:#202938;border:1px solid #49546b;border-radius:5px;padding:7px 10px}
.pointlesh-interactions button{cursor:pointer}.pointlesh-interactions button:hover{background:#34435b}.pointlesh-interactions button:disabled{opacity:.45;cursor:default}.pointlesh-interactions :focus-visible{outline:2px solid #8cbaff;outline-offset:2px}
.pointlesh-interactions-title{display:flex;align-items:center;gap:16px;cursor:move;flex:none}.pointlesh-interactions-title h2{font-size:18px;margin:0}.pointlesh-interactions-title [role=status]{font-size:11px;color:#aab6ca;margin-left:auto;max-width:55%}
.pointlesh-interactions-tools{display:flex;gap:8px;flex-wrap:wrap;flex:none}.pointlesh-interactions-tools input{flex:1;min-width:170px}.pointlesh-interactions-legend{display:flex;gap:20px;flex-wrap:wrap;margin:0;color:#bdc8da;font-size:12px}
.pointlesh-interactions .simple{color:#82d59e}.pointlesh-interactions .impossible{color:#f08989}.pointlesh-interactions-scroll{overflow:auto;flex:1;min-height:80px;border:1px solid #344055;border-radius:6px}
.pointlesh-interactions table{border-collapse:separate;border-spacing:0;width:100%;table-layout:auto}.pointlesh-interactions th,.pointlesh-interactions td{border-bottom:1px solid #2d3647;border-right:1px solid #2d3647;padding:0;text-align:center;min-width:110px}
.pointlesh-interactions th{padding:10px;background:#202938;font-weight:600}.pointlesh-interactions thead th{position:sticky;top:0;z-index:2}.pointlesh-interactions tbody th{position:sticky;left:0;z-index:1;text-align:left;min-width:235px;max-width:300px}.pointlesh-interactions thead th:first-child{left:0;z-index:3;min-width:235px}.pointlesh-interactions small{display:block;font-size:10px;font-weight:400;color:#99a8bf;margin-top:5px}
.pointlesh-interactions td button{display:block;border:0;border-radius:0;width:100%;height:51px;font-size:21px;background:#171e29}.pointlesh-interactions tr:nth-child(even) td button{background:#1b2330}.pointlesh-interactions tr td button:hover{background:#35435a}.pointlesh-interactions-count{font-size:11px;color:#aab6ca;margin:0;flex:none}
.pointlesh-interaction-defaults th,.pointlesh-interactions .pointlesh-interaction-defaults td button{background:#283449;border-bottom:2px solid #6883a8}.pointlesh-interaction-sentences>div{display:flex;align-items:center;gap:10px}.pointlesh-interaction-sentences label{flex:1}.pointlesh-interaction-edit [hidden]{display:none!important}
.pointlesh-interaction-edit{max-height:85vh;overflow:auto;width:min(540px,90vw);padding:24px;color:#e6eaf2;background:#192230;border:1px solid #677a99;border-radius:10px;font:13px system-ui}.pointlesh-interaction-edit::backdrop{background:#060b1399}.pointlesh-interaction-edit h3{margin:0 0 20px;font-size:17px}.pointlesh-interaction-edit label{display:grid;gap:8px;margin-bottom:16px}.pointlesh-interaction-edit label[hidden]{display:none}.pointlesh-interaction-edit textarea{resize:vertical;min-height:100px}.pointlesh-interaction-edit p{color:#aab9cf;line-height:1.5}.pointlesh-interaction-actions{display:flex;gap:8px;justify-content:flex-end}.pointlesh-interaction-actions button:first-child{margin-right:auto}
`;
