import { registerInGameDesignerPanel, type AiAssetManifest } from "@ai-game-assets/core";
import {
  isPointleshPrefab,
  assertJSON,
  resolvePointleshScene,
  pointleshAreaCapabilities,
  mergeCharacterAnimations,
  readCharacterAnimations,
  assertCharacterAnimations,
  type CharacterAnimationActivity,
  type CharacterAnimationAssignment,
  type CharacterAnimationDirection,
  type CharacterAnimations,
  type PointleshPrefabDefinition,
  type PointleshPrefabInstance,
  type PointleshProperties,
  type PointleshProperty,
  type PointleshPropertySchema,
  type PointleshResolvedScene,
} from "@pointlesh/core";
import { prefabAttributeId, prefabInstanceIdFromAttributeId, resolvePrefabNumber, resolveSceneArea, type SceneDesignerManifest, type SceneSelection } from "@scene-designer/core";
import { installSceneDesigner, type SceneDesigner, type SceneDesignerOptions } from "@scene-designer/designer";

export type PointleshInspectorOptions = {
  designer: SceneDesigner;
  aiAssets?: AiAssetManifest;
  mount?: HTMLElement;
  /** Runs for inspector edits and inspector undo/redo. Native edits keep their own callback. */
  onManifestChange?(manifest: SceneDesignerManifest): void;
  onPreview?(scene: PointleshResolvedScene): void;
};
export type PointleshInspector = {
  root: HTMLElement;
  /** Call from native changes, preserving history:false for later updates in a drag. */
  sync(options?: PointleshInspectorEditOptions): void;
  open(): void;
  close(): void;
  /** Refresh animation choices after an AI asset edit or generated preview. Does not add history. */
  setAiAssets(manifest: AiAssetManifest): void;
  /** Open the upstream vector editor for an instance's native area attribute. */
  editShape(instanceId: string, attributeId?: string): void;
  setProperties(instanceId: string, properties: PointleshProperties, options?: PointleshInspectorEditOptions): void;
  setPrefabProperties(prefabId: string, properties: PointleshProperties, options?: PointleshInspectorEditOptions): void;
  setBehaviors(instanceId: string, behaviorIds: string[]): void;
  undo(): void;
  redo(): void;
  exportManifest(): string;
  destroy(): void;
};
/** Use history:false for subsequent updates within one continuous pointer gesture. */
export type PointleshInspectorEditOptions = { history?: boolean };
export type PointleshDesignerOptions = SceneDesignerOptions & {
  inspectorMount?: HTMLElement;
  onPreview?(scene: PointleshResolvedScene): void;
};
export type InstalledPointleshDesigner = {
  designer: SceneDesigner;
  inspector: PointleshInspector;
  destroy(): void;
};

/** Engine-neutral installation. Phaser callers can attach the inspector to their native canvas adapter. */
export function installPointleshDesigner(options: PointleshDesignerOptions): InstalledPointleshDesigner {
  let inspector: PointleshInspector | undefined;
  const designer = installSceneDesigner({
    ...options,
    onManifestChange(manifest) {
      options.onManifestChange?.(manifest);
      inspector?.sync();
    },
    onSelectionChange(selection) {
      options.onSelectionChange?.(selection);
      inspector?.sync();
    },
    onSceneChange(sceneId, scene) {
      options.onSceneChange?.(sceneId, scene);
      inspector?.sync();
    },
  });
  inspector = installPointleshInspector({ designer, aiAssets: options.aiAssets, mount: options.inspectorMount ?? options.mount, onPreview: options.onPreview });
  return { designer, inspector, destroy() { inspector?.destroy(); designer.destroy(); } };
}

type Target = { prefab: PointleshPrefabDefinition; instance?: PointleshPrefabInstance; sceneId?: string; layerId?: string };
const animationActivities: { id: CharacterAnimationActivity; label: string }[] = [{ id: 'idle', label: 'Idle' }, { id: 'walk', label: 'Walk' }, { id: 'speak', label: 'Speak' }];
const animationDirections: { id: CharacterAnimationDirection; label: string; diagonal?: boolean }[] = [
  { id: 'front', label: 'Front' }, { id: 'back', label: 'Back' }, { id: 'left', label: 'Left' }, { id: 'right', label: 'Right' },
  { id: 'front-left', label: 'Front left', diagonal: true }, { id: 'front-right', label: 'Front right', diagonal: true },
  { id: 'back-left', label: 'Back left', diagonal: true }, { id: 'back-right', label: 'Back right', diagonal: true },
];
const areaPropertyKeys = new Set(['walkable', 'scaleEnabled', 'zoomEnabled', 'walkBehindEnabled', 'scaleAxis', 'zoomAxis', 'axis', 'minScale', 'maxScale', 'minZoom', 'maxZoom', 'smoothing', 'baseline']);

export function installPointleshInspector(options: PointleshInspectorOptions): PointleshInspector {
  const designer = options.designer;
  const document = (options.mount ?? designer.root).ownerDocument;
  installStyles(document);
  const root = element(document, "section", "pointlesh-inspector");
  root.setAttribute("aria-label", "Pointlesh adventure properties");
  const title = element(document, "header", "pointlesh-inspector-title", "Adventure properties");
  const body = element(document, "div", "pointlesh-inspector-body");
  const toolbar = element(document, "div", "pointlesh-inspector-toolbar");
  const status = element(document, "p", "pointlesh-inspector-status");
  status.setAttribute("role", "status");
  root.append(title, toolbar, body, status);
  (options.mount ?? document.body).append(root);
  const past: SceneDesignerManifest[] = [], future: SceneDesignerManifest[] = [];
  let last = designer.getManifest();
  let lastJson = JSON.stringify(last);
  let restoring = false;
  let destroyed = false;
  let manualInstanceId: string | undefined;
  let selectionKey = "";
  let aiAssets = structuredClone(options.aiAssets ?? { schemaVersion: 1, assets: {} } as AiAssetManifest);
  let activeAnimationActivity: CharacterAnimationActivity = 'idle';
  let nativeContext: HTMLElement | undefined;
  let nativeContextKey = '';
  const dock = registerInGameDesignerPanel({ id: "pointlesh.properties", label: "Adventure", panel: root, dragHandle: title, order: 40, onOpenChange(open) { if (open) sync(); } });
  const undoButton = button(document, "Undo", () => undo());
  const redoButton = button(document, "Redo", () => redo());
  const exportButton = button(document, "Export JSON", () => {
    const url = URL.createObjectURL(new Blob([api.exportManifest()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "pointlesh-scenes.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = "Scene manifest exported, including custom properties and behaviors.";
  });
  toolbar.append(undoButton, redoButton, exportButton);

  function notify() {
    options.onManifestChange?.(designer.getManifest());
  }

  function apply(next: SceneDesignerManifest, saveHistory = true) {
    if (saveHistory) { past.push(structuredClone(last)); if (past.length > 100) past.shift(); future.length = 0; }
    const selection = designer.getSelection();
    restoring = true;
    try {
      designer.setManifest(next);
      if (selection) designer.select(selection);
    } finally { restoring = false; }
    last = designer.getManifest(); lastJson = JSON.stringify(last);
    render(); preview(); notify();
  }

  function undo() {
    const previous = past.pop(); if (!previous) return;
    future.push(structuredClone(last)); apply(previous, false);
  }
  function redo() {
    const next = future.pop(); if (!next) return;
    past.push(structuredClone(last)); apply(next, false);
  }
  function preview() {
    const sceneId = designer.getSceneId();
    if (last.scenes[sceneId]) options.onPreview?.(resolvePointleshScene(last, sceneId));
  }
  function sync(editOptions: PointleshInspectorEditOptions = {}) {
    if (restoring || destroyed) return;
    const next = designer.getManifest(), json = JSON.stringify(next);
    if (json !== lastJson) {
      if (editOptions.history !== false) {
        past.push(structuredClone(last)); if (past.length > 100) past.shift();
        future.length = 0;
      }
      last = next; lastJson = json;
    }
    const nextSelectionKey = JSON.stringify(designer.getSelection());
    if (selectionKey !== nextSelectionKey) { manualInstanceId = undefined; selectionKey = nextSelectionKey; }
    render(); preview();
  }
  function setTargetProperties(next: SceneDesignerManifest, target: Target, properties: PointleshProperties, editOptions: PointleshInspectorEditOptions = {}) {
    for (const [key, value] of Object.entries(properties)) {
      assertProperty(key, value, target.prefab.pointlesh.propertySchema?.[key]);
      if (key === 'animations') assertCharacterAnimations(value);
      const numeric = target.prefab.attributes.find(attribute => attribute.id === key && attribute.kind === "number");
      if (numeric?.kind === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
        if (numeric.number.min !== undefined && value < numeric.number.min) throw new Error(`${key} must be at least ${numeric.number.min}.`);
        if (numeric.number.max !== undefined && value > numeric.number.max) throw new Error(`${key} must be at most ${numeric.number.max}.`);
        if (target.instance) { target.instance.overrides ??= {}; target.instance.overrides[key] = { value }; }
        else numeric.number.value = value;
      } else if (target.instance) {
        target.instance.pointlesh ??= {};
        target.instance.pointlesh.properties ??= {};
        target.instance.pointlesh.properties[key] = structuredClone(value);
      } else target.prefab.pointlesh.properties[key] = structuredClone(value);
    }
    apply(next, editOptions.history !== false);
  }

  function editNativeShape(target: Target, attributeId: string) {
    const attribute = target.prefab.attributes.find(attribute => attribute.id === attributeId && (attribute.kind === 'area' || attribute.kind === 'platform'));
    if (!attribute || (attribute.kind !== 'area' && attribute.kind !== 'platform')) throw new Error(`Unknown area attribute "${attributeId}".`);
    dock.close();
    if (target.instance && target.sceneId && target.layerId) {
      const areaId = prefabAttributeId(target.instance.id, attribute.id);
      const area = resolveSceneArea(designer.getManifest(), target.sceneId, areaId).area;
      designer.open();
      designer.select({ type: 'area', sceneId: target.sceneId, layerId: target.layerId, areaId });
      designer.setMode(area.closed && area.vertices.length ? 'select' : 'area-draw');
    } else {
      // Upstream exposes open() for Scenes; its registered button opens Prefabs.
      const prefabToggle = document.querySelector<HTMLButtonElement>('button[aria-label="Toggle prefab designer"]');
      if (!prefabToggle) throw new Error('Open the native Prefabs panel to edit this definition.');
      if (prefabToggle.getAttribute('aria-expanded') !== 'true') prefabToggle.click();
      designer.select({ type: 'prefab-area', prefabId: target.prefab.id, attributeId });
      const area = attribute.kind === 'area' ? attribute.area : attribute.platform;
      designer.setMode(area.closed && area.vertices.length ? 'select' : 'area-draw');
    }
  }

  function editAnimation(target: Target, activity: CharacterAnimationActivity, direction: CharacterAnimationDirection, assignment?: CharacterAnimationAssignment) {
    const next = designer.getManifest();
    const current = target.instance ? instanceTarget(next, target.instance.id) : prefabTarget(next, target.prefab.id);
    if (!current) throw new Error('The selected character no longer exists.');
    const properties = current.instance?.pointlesh?.properties ?? (current.instance ? {} : current.prefab.pointlesh.properties);
    const animations = structuredClone(readCharacterAnimations(properties) ?? {});
    if (assignment) {
      animations[activity] ??= {};
      animations[activity]![direction] = assignment;
    } else {
      delete animations[activity]?.[direction];
      if (animations[activity] && !Object.keys(animations[activity]!).length) delete animations[activity];
    }
    if (Object.keys(animations).length) setTargetProperties(next, current, { animations: animations as PointleshProperty });
    else {
      if (current.instance?.pointlesh?.properties) delete current.instance.pointlesh.properties.animations;
      else if (!current.instance) delete current.prefab.pointlesh.properties.animations;
      apply(next);
    }
  }

  function animationEditor(target: Target, values: PointleshProperties, edit: (key: string, value: PointleshProperty) => void) {
    const section = element(document, 'section', 'pointlesh-animations');
    section.setAttribute('aria-label', 'Character animations');
    section.append(element(document, 'h4', '', 'Directional animations'));
    section.append(element(document, 'p', 'pointlesh-inspector-help', 'Assign animations from Assets. Flip mirrors only this direction. Unset diagonals use the front or back animation.'));
    section.append(element(document, 'p', 'pointlesh-inspector-help', 'Edit animation frames and timing in Assets. Walking distance per frame stays in the character properties below.'));
    const directionLabel = element(document, 'label', 'pointlesh-inspector-field');
    directionLabel.append(element(document, 'span', '', 'Directions'));
    const directionCount = document.createElement('select'); directionCount.setAttribute('aria-label', 'Character directions');
    addOption(directionCount, '4', '4 directions'); addOption(directionCount, '8', '8 directions'); directionCount.value = String(values.directions ?? 4);
    directionCount.addEventListener('change', () => edit('directions', Number(directionCount.value)));
    directionLabel.append(directionCount); section.append(directionLabel);
    const facingLabel = element(document, 'label', 'pointlesh-inspector-field');
    facingLabel.append(element(document, 'span', '', 'Facing'));
    const facing = document.createElement('select'); facing.setAttribute('aria-label', 'Facing');
    for (const direction of animationDirections.filter(direction => !direction.diagonal || values.directions === 8)) {
      addOption(facing, direction.id.replace('front', 'down').replace('back', 'up'), direction.label);
    }
    const currentFacing = String(values.facing ?? 'down');
    if (![...facing.options].some(option => option.value === currentFacing)) {
      const label = animationDirections.find(direction => direction.id.replace('front', 'down').replace('back', 'up') === currentFacing)?.label ?? currentFacing;
      addOption(facing, currentFacing, `${label} (8 directions)`);
    }
    facing.value = currentFacing;
    facing.addEventListener('change', () => edit('facing', facing.value));
    facingLabel.append(facing); section.append(facingLabel);
    const tabs = element(document, 'div', 'pointlesh-animation-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Animation activity');
    for (const activity of animationActivities) {
      const tab = button(document, activity.label, () => { activeAnimationActivity = activity.id; render(); });
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(activity.id === activeAnimationActivity)); tabs.append(tab);
    }
    section.append(tabs);
    const base = readCharacterAnimations(target.prefab.pointlesh.properties) ?? {};
    const overrides = readCharacterAnimations(target.instance?.pointlesh?.properties ?? {}) ?? {};
    const effective = target.instance ? mergeCharacterAnimations(base, overrides) : base;
    const own = target.instance ? overrides : base;
    const objectAttribute = target.prefab.attributes.find(attribute => attribute.kind === 'object');
    const objectOverride = objectAttribute && target.instance?.overrides?.[objectAttribute.id] as { assetId?: string } | undefined;
    const defaultAssetId = objectOverride?.assetId ?? (objectAttribute?.kind === 'object' ? objectAttribute.object.assetId : '');
    const choices = Object.values(aiAssets.assets).filter(asset => animationChoices(asset.id).length || asset.kind === 'spritesheet' || asset.kind === 'animation');
    for (const direction of animationDirections.filter(direction => !direction.diagonal || values.directions === 8)) {
      const activity = activeAnimationActivity;
      const assignment = effective[activity]?.[direction.id];
      const ownAssignment = own[activity]?.[direction.id];
      const card = element(document, 'fieldset', 'pointlesh-animation-slot');
      card.append(element(document, 'legend', '', direction.label));
      const prefix = `${animationActivities.find(entry => entry.id === activity)!.label} ${direction.label}`;
      const assetSelect = document.createElement('select'); assetSelect.setAttribute('aria-label', `${prefix} asset`);
      addOption(assetSelect, '', 'Choose an asset…');
      for (const asset of choices) addOption(assetSelect, asset.id, asset.id);
      const assetId = assignment?.assetId ?? defaultAssetId;
      if (assetId && !choices.some(asset => asset.id === assetId)) addOption(assetSelect, assetId, `${assetId} · no animations`);
      assetSelect.value = assetId;
      const keySelect = document.createElement('select'); keySelect.setAttribute('aria-label', `${prefix} animation`);
      addOption(keySelect, '', target.instance ? 'Inherited / fallback' : 'Not assigned');
      const keys = animationChoices(assetId);
      for (const choice of keys) addOption(keySelect, choice.key, choice.label);
      if (assignment?.key && !keys.some(choice => choice.key === assignment.key)) addOption(keySelect, assignment.key, `${assignment.key} · unavailable`);
      keySelect.value = assignment?.key ?? '';
      const commit = (assignment?: CharacterAnimationAssignment) => {
        try { editAnimation(target, activity, direction.id, assignment); status.textContent = `Updated ${prefix.toLowerCase()} animation.`; }
        catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      };
      assetSelect.addEventListener('change', () => {
        const available = animationChoices(assetSelect.value);
        const key = available.find(animation => animation.key === assignment?.key)?.key ?? available[0]?.key;
        if (!key) { status.textContent = 'Add a named animation to this asset in Assets before assigning it.'; render(); return; }
        commit({ assetId: assetSelect.value, key, flipX: assignment?.flipX ?? false });
      });
      keySelect.addEventListener('change', () => commit(keySelect.value ? { assetId: assetSelect.value, key: keySelect.value, flipX: assignment?.flipX ?? false } : undefined));
      const flipLabel = element(document, 'label', 'pointlesh-animation-flip');
      const flip = document.createElement('input'); flip.type = 'checkbox'; flip.checked = assignment?.flipX ?? false; flip.disabled = !assignment; flip.setAttribute('aria-label', `${prefix} Flip`);
      flip.addEventListener('change', () => { if (assignment) commit({ ...assignment, flipX: flip.checked }); });
      flipLabel.append(flip, document.createTextNode('Flip'));
      const reset = button(document, target.instance ? 'Use prefab' : 'Clear', () => commit());
      reset.setAttribute('aria-label', `${prefix} ${target.instance ? 'Use prefab' : 'Clear'}`); reset.disabled = !ownAssignment;
      const footer = element(document, 'div', 'pointlesh-animation-footer'); footer.append(flipLabel, reset);
      card.append(assetSelect, keySelect, footer);
      if (target.instance && !ownAssignment) card.append(element(document, 'small', 'pointlesh-inspector-help', assignment ? 'Inherited from prefab' : 'Uses runtime fallback'));
      section.append(card);
    }
    return section;
  }

  function animationChoices(assetId: string): { key: string; label: string }[] {
    const asset = aiAssets.assets[assetId];
    if (!asset) return [];
    const choices = new Map((asset.animations ?? []).map(animation => [animation.key, { key: animation.key, label: animation.key }]));
    for (const [key, linked] of Object.entries(asset.linkedAnimationAssets ?? {})) choices.set(key, { key, label: `${linked.label || key} (${key})` });
    return [...choices.values()];
  }

  function areaEditor(target: Target, values: PointleshProperties, schemas: Record<string, PointleshPropertySchema>, edit: (key: string, value: PointleshProperty) => void) {
    const section = element(document, 'section', 'pointlesh-area-capabilities');
    section.setAttribute('aria-label', 'Area capabilities');
    section.append(element(document, 'h4', '', 'Area capabilities'));
    section.append(element(document, 'p', 'pointlesh-inspector-help', 'One shape can control several behaviors. Turn each capability on independently.'));
    const capabilities = pointleshAreaCapabilities({ kind: target.prefab.pointlesh.kind, properties: values });
    const numeric = (key: string, label: string, fallback: number, min: number | undefined, step: number) =>
      propertyField(document, key, values[key] ?? fallback, { label, min, step, ...schemas[key], type: 'number' }, edit, status);
    const axis = (key: 'scaleAxis' | 'zoomAxis', label: string) => {
      const field = element(document, 'label', 'pointlesh-inspector-field');
      field.append(element(document, 'span', '', label));
      const input = document.createElement('select'); input.setAttribute('aria-label', label);
      addOption(input, 'y', 'Y · vertical'); addOption(input, 'x', 'X · horizontal');
      input.value = String(values[key] ?? values.axis ?? 'y');
      input.addEventListener('change', () => edit(key, input.value));
      field.append(input); return field;
    };
    const toggle = (key: string, label: string, checked: boolean) => propertyField(document, key, checked, { type: 'boolean', label }, edit, status);
    section.append(toggle('walkable', 'Walkable', capabilities.walkable));
    section.append(toggle('scaleEnabled', 'Character scale', capabilities.scale));
    if (capabilities.scale) {
      const fields = element(document, 'div', 'pointlesh-area-settings');
      fields.append(axis('scaleAxis', 'Scale axis'), numeric('minScale', 'Scale at start', 0.65, 0.01, 0.05), numeric('maxScale', 'Scale at end', 1, 0.01, 0.05));
      section.append(fields);
    }
    section.append(toggle('zoomEnabled', 'Camera zoom', capabilities.zoom));
    if (capabilities.zoom) {
      const fields = element(document, 'div', 'pointlesh-area-settings');
      fields.append(axis('zoomAxis', 'Zoom axis'), numeric('minZoom', 'Zoom at start', 1.2, 0.01, 0.05), numeric('maxZoom', 'Zoom at end', 1, 0.01, 0.05), numeric('smoothing', 'Camera response', 5, 0, 0.5));
      section.append(fields);
    }
    section.append(toggle('walkBehindEnabled', 'Walk-behind', capabilities.walkBehind));
    if (capabilities.walkBehind) {
      const fields = element(document, 'div', 'pointlesh-area-settings');
      fields.append(numeric('baseline', 'Baseline', 160, undefined, 1));
      fields.append(element(document, 'p', 'pointlesh-inspector-help', 'Drag the horizontal baseline in the scene. Characters whose feet are above it walk behind this area.'));
      section.append(fields);
    }
    return section;
  }

  function targetFromSelection(manifest: SceneDesignerManifest): Target | undefined {
    if (manualInstanceId) return instanceTarget(manifest, manualInstanceId);
    return targetFromNativeSelection(manifest);
  }

  function targetFromNativeSelection(manifest: SceneDesignerManifest): Target | undefined {
    const selection = designer.getSelection();
    if (!selection) return;
    if ("prefabId" in selection) {
      const prefab = manifest.prefabs?.[selection.prefabId];
      return prefab && isPointleshPrefab(prefab) ? { prefab } : undefined;
    }
    const id = instanceIdFromSelection(selection);
    return id ? instanceTarget(manifest, id) : undefined;
  }

  function syncNativeContext() {
    if (destroyed) return;
    const target = targetFromNativeSelection(last);
    const view = designer.getOpenView();
    const editor = view && designer.root.querySelector<HTMLElement>(`.scene-designer__panel[data-panel="${view}"] .scene-designer__editor`);
    if (!editor || !target || !['area', 'walkable', 'walk-behind', 'scale', 'zoom'].includes(target.prefab.pointlesh.kind)) {
      nativeContext?.remove(); nativeContext = undefined; nativeContextKey = ''; restoreNativeFields(); return;
    }
    const key = `${view}:${JSON.stringify(designer.getSelection())}:${lastJson}:${past.length}:${future.length}`;
    if (nativeContext?.parentElement === editor && nativeContextKey === key) return;
    nativeContext?.remove();
    restoreNativeFields();
    nativeContext = element(document, 'section', 'pointlesh-native-area-context');
    nativeContext.setAttribute('aria-label', 'Selected area adventure properties');
    const values: PointleshProperties = { ...target.prefab.pointlesh.properties, ...target.instance?.pointlesh?.properties };
    const schemas = { ...target.prefab.pointlesh.propertySchema };
    for (const attribute of target.prefab.attributes) if (attribute.kind === 'number') {
      values[attribute.id] = resolvePrefabNumber(last, target.prefab.id, attribute.id, target.instance);
      schemas[attribute.id] = { type: 'number', label: attribute.name, min: attribute.number.min, max: attribute.number.max, step: attribute.number.step };
    }
    const edit = (property: string, value: PointleshProperty) => {
      const next = designer.getManifest();
      const current = target.instance ? instanceTarget(next, target.instance.id) : prefabTarget(next, target.prefab.id);
      if (current) setTargetProperties(next, current, { [property]: value });
    };
    nativeContext.append(areaEditor(target, values, schemas, edit));
    const history = element(document, 'div', 'pointlesh-native-area-history');
    const undo = button(document, 'Undo area edit', () => api.undo()); undo.disabled = !past.length;
    const redo = button(document, 'Redo area edit', () => api.redo()); redo.disabled = !future.length;
    history.append(undo, redo); nativeContext.append(history);
    nativeContextKey = key;
    editor.prepend(nativeContext);
    // Native number attributes remain part of the manifest. Present their controls
    // once, grouped under the capability that uses them, instead of twice in this panel.
    if (designer.getSelection()?.type === 'prefab' || view === 'prefabs') {
      const sections = editor.querySelectorAll<HTMLElement>(':scope > .scene-designer__stack > .scene-designer__attribute');
      target.prefab.attributes.forEach((attribute, index) => {
        const section = sections[index];
        if (attribute.kind === 'number' && areaPropertyKeys.has(attribute.id) && section && !section.hidden) {
          section.hidden = true; section.dataset.pointleshHiddenField = 'true';
        }
      });
    }
  }

  function restoreNativeFields() {
    for (const section of designer.root.querySelectorAll<HTMLElement>('[data-pointlesh-hidden-field]')) {
      section.hidden = false; delete section.dataset.pointleshHiddenField;
    }
  }

  function render() {
    if (destroyed) return;
    syncNativeContext();
    body.replaceChildren(); undoButton.disabled = !past.length; redoButton.disabled = !future.length;
    const manifest = last, scene = manifest.scenes[designer.getSceneId()];
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Adventure entity");
    const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Select an adventure entity…"; select.append(empty);
    for (const layer of scene?.layers ?? []) for (const instance of layer.prefabs ?? []) {
      const prefab = manifest.prefabs?.[instance.prefabId];
      if (!prefab || !isPointleshPrefab(prefab)) continue;
      const option = document.createElement("option"); option.value = instance.id; option.textContent = `${instance.name ?? prefab.name} · ${prefab.pointlesh.kind}`; select.append(option);
    }
    const target = targetFromSelection(manifest);
    if (target?.instance) select.value = target.instance.id;
    select.addEventListener("change", () => { manualInstanceId = select.value || undefined; render(); });
    body.append(select);
    if (!target) {
      body.append(element(document, "p", "pointlesh-inspector-help", "Select a Pointlesh prefab instance or a prefab definition. Draw shapes and move sprites in Scenes; edit adventure behavior here. Changes immediately update the running preview."));
      return;
    }
    body.append(element(document, "h3", "", target.instance?.name ?? target.prefab.name));
    body.append(element(document, "p", "pointlesh-inspector-help", target.instance ? `${target.prefab.pointlesh.kind} · instance ${target.instance.id}` : `${target.prefab.pointlesh.kind} · prefab defaults`));
    const shapes = target.prefab.attributes.filter(attribute => attribute.kind === 'area' || attribute.kind === 'platform');
    for (const shape of shapes) body.append(button(document, shapes.length === 1 ? 'Edit shape' : `Edit ${shape.name} shape`, () => {
      try { editNativeShape(target, shape.id); }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    }));
    if (shapes.length) body.append(element(document, 'p', 'pointlesh-inspector-help', 'Native vector tools: drag a vertex to reshape; drag an edge to curve it; double-click an edge to add a vertex. Select a vertex and press Delete to remove it.'));
    const values: PointleshProperties = { ...target.prefab.pointlesh.properties, ...target.instance?.pointlesh?.properties };
    const schemas = { ...target.prefab.pointlesh.propertySchema };
    for (const attribute of target.prefab.attributes) if (attribute.kind === "number") {
      values[attribute.id] = resolvePrefabNumber(manifest, target.prefab.id, attribute.id, target.instance);
      schemas[attribute.id] = { label: attribute.name, type: "number", min: attribute.number.min, max: attribute.number.max, step: attribute.number.step };
    }
    const edit = (key: string, value: PointleshProperty) => {
      const next = designer.getManifest();
      const current = target.instance ? instanceTarget(next, target.instance.id) : prefabTarget(next, target.prefab.id);
      if (!current) throw new Error("The selected prefab no longer exists.");
      setTargetProperties(next, current, { [key]: value });
    };
    const effectiveAnimations = target.prefab.pointlesh.kind === 'character'
      ? mergeCharacterAnimations(readCharacterAnimations(target.prefab.pointlesh.properties), readCharacterAnimations(target.instance?.pointlesh?.properties ?? {}))
      : {};
    const hasAnimationAssignments = Object.values(effectiveAnimations).some(slots => !!slots && Object.keys(slots).length > 0);
    if (target.prefab.pointlesh.kind === 'character') body.append(animationEditor(target, values, edit));
    const isArea = ['area', 'walkable', 'walk-behind', 'scale', 'zoom'].includes(target.prefab.pointlesh.kind);
    if (isArea) body.append(areaEditor(target, values, schemas, edit));
    for (const [key, value] of Object.entries(values)) {
      if (isArea && areaPropertyKeys.has(key)) continue;
      if (target.prefab.pointlesh.kind === 'character' && (key === 'animations' || key === 'directions' || key === 'facing')) continue;
      if (target.prefab.pointlesh.kind === 'character' && hasAnimationAssignments && (key === 'frameCount' || key === 'frameDurationMs')) continue;
      body.append(propertyField(document, key, value, schemas[key], edit, status));
    }
    const behaviorLabel = element(document, "label", "pointlesh-inspector-field");
    behaviorLabel.append(element(document, "span", "", target.instance ? "Extra behavior IDs" : "Default behavior IDs"));
    const behaviorInput = document.createElement("input");
    behaviorInput.value = (target.instance ? target.instance.pointlesh?.behaviors ?? [] : target.prefab.pointlesh.behaviors).join(", ");
    behaviorInput.placeholder = "inspect, quest.locked-door";
    behaviorInput.addEventListener("change", () => {
      try {
        const next = designer.getManifest();
        const current = target.instance ? instanceTarget(next, target.instance.id) : prefabTarget(next, target.prefab.id);
        if (!current) return;
        const ids = behaviorInput.value.split(",").map(id => id.trim()).filter(Boolean);
        if (current.instance) { current.instance.pointlesh ??= {}; current.instance.pointlesh.behaviors = [...new Set(ids)]; }
        else current.prefab.pointlesh.behaviors = [...new Set(ids)];
        apply(next); status.textContent = "Behavior IDs updated.";
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    });
    behaviorLabel.append(behaviorInput); body.append(behaviorLabel);
    body.append(element(document, "p", "pointlesh-inspector-help", "Behavior IDs connect to code registered by your game. Save data stays JSON; behavior functions stay in source."));
    const extension = element(document, "details", "pointlesh-inspector-extension");
    extension.append(element(document, "summary", "", "Add custom property"));
    const name = document.createElement("input"); name.placeholder = "Property name"; name.setAttribute("aria-label", "Custom property name");
    const json = document.createElement("textarea"); json.value = "true"; json.setAttribute("aria-label", "Custom property JSON value");
    extension.append(name, json, button(document, "Add property", () => {
      try {
        const key = name.value.trim(); if (!key) throw new Error("Enter a property name.");
        edit(key, JSON.parse(json.value) as PointleshProperty); status.textContent = `Updated ${key}.`;
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    }));
    body.append(extension);
  }
  const api: PointleshInspector = {
    root, sync, open() { sync(); dock.open(); }, close() { dock.close(); },
    setAiAssets(manifest) { aiAssets = structuredClone(manifest); render(); },
    editShape(instanceId, attributeId = 'area') {
      const target = instanceTarget(designer.getManifest(), instanceId);
      if (!target) throw new Error(`Unknown Pointlesh instance "${instanceId}".`);
      editNativeShape(target, attributeId);
    },
    setProperties(instanceId, properties, editOptions) {
      const next = designer.getManifest(), target = instanceTarget(next, instanceId);
      if (!target) throw new Error(`Unknown Pointlesh instance "${instanceId}".`);
      setTargetProperties(next, target, properties, editOptions);
    },
    setPrefabProperties(prefabId, properties, editOptions) {
      const next = designer.getManifest(), target = prefabTarget(next, prefabId);
      if (!target) throw new Error(`Unknown Pointlesh prefab "${prefabId}".`);
      setTargetProperties(next, target, properties, editOptions);
    },
    setBehaviors(instanceId, behaviorIds) {
      const next = designer.getManifest(), target = instanceTarget(next, instanceId);
      if (!target?.instance) throw new Error(`Unknown Pointlesh instance "${instanceId}".`);
      if (behaviorIds.some(id => typeof id !== "string" || !id.trim())) throw new Error("Behavior IDs must be nonempty strings.");
      target.instance.pointlesh ??= {}; target.instance.pointlesh.behaviors = [...new Set(behaviorIds)]; apply(next);
    },
    undo, redo, exportManifest() { return JSON.stringify(designer.getManifest(), null, 2) + "\n"; },
    destroy() {
      if (destroyed) return;
      destroyed = true; nativeObserver.disconnect(); nativeContext?.remove(); restoreNativeFields(); dock.destroy(); root.remove();
    },
  };
  // Upstream renders its native inspector after some open/mode events. Reattach
  // this contextual card without changing native selection, geometry, or history.
  const nativeObserver = new document.defaultView!.MutationObserver(syncNativeContext);
  nativeObserver.observe(designer.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });
  sync();
  return api;
}

function instanceTarget(manifest: SceneDesignerManifest, instanceId: string): Target | undefined {
  for (const scene of Object.values(manifest.scenes)) for (const layer of scene.layers) {
    const instance = layer.prefabs?.find(candidate => candidate.id === instanceId) as PointleshPrefabInstance | undefined;
    if (!instance) continue;
    const target = prefabTarget(manifest, instance.prefabId);
    if (target) return { ...target, instance, sceneId: scene.id, layerId: layer.id };
  }
}
function prefabTarget(manifest: SceneDesignerManifest, prefabId: string): Target | undefined {
  const prefab = manifest.prefabs?.[prefabId];
  return prefab && isPointleshPrefab(prefab) ? { prefab } : undefined;
}
function instanceIdFromSelection(selection: SceneSelection): string | undefined {
  if (selection.type === "prefab") return selection.instanceId;
  if (selection.type === "area" || selection.type === "vertex" || selection.type === "tiles") return prefabInstanceIdFromAttributeId(selection.areaId);
  if (selection.type === "object") return prefabInstanceIdFromAttributeId(selection.objectId);
  return undefined;
}
function assertProperty(key: string, value: PointleshProperty, schema?: PointleshPropertySchema): void {
  if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Choose a different property name.");
  assertJSON(value, key);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${key} must be finite.`);
  if (schema?.type !== undefined && schema.type !== "json" && typeof value !== schema.type) throw new Error(`${key} must be ${schema.type}.`);
  if (typeof value === "number" && schema?.min !== undefined && value < schema.min) throw new Error(`${key} must be at least ${schema.min}.`);
  if (typeof value === "number" && schema?.max !== undefined && value > schema.max) throw new Error(`${key} must be at most ${schema.max}.`);
}
function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node;
}
function button(document: Document, text: string, action: () => void): HTMLButtonElement {
  const node = element(document, "button", "", text); node.type = "button"; node.addEventListener("click", action); return node;
}
function addOption(select: HTMLSelectElement, value: string, text: string) {
  const option = select.ownerDocument.createElement('option'); option.value = value; option.textContent = text; select.append(option);
}
function propertyField(document: Document, key: string, value: PointleshProperty, schema: PointleshPropertySchema | undefined, edit: (key: string, value: PointleshProperty) => void, status: HTMLElement): HTMLElement {
  const label = element(document, "label", "pointlesh-inspector-field");
  label.append(element(document, "span", "", schema?.label ?? key));
  const type = schema?.type ?? (typeof value === "object" ? "json" : typeof value);
  const input = type === "json" ? document.createElement("textarea") : document.createElement("input");
  if (input instanceof HTMLInputElement) {
    input.type = type === "boolean" ? "checkbox" : type === "number" ? "number" : "text";
    if (type === "boolean") input.checked = value === true;
    if (schema?.min !== undefined) input.min = String(schema.min);
    if (schema?.max !== undefined) input.max = String(schema.max);
    if (type === "number") input.step = String(schema?.step ?? "any");
  }
  input.value = type === "json" ? JSON.stringify(value) : String(value);
  input.setAttribute("aria-label", schema?.label ?? key);
  if (schema?.description) input.title = schema.description;
  input.addEventListener("change", () => {
    try {
      const next = type === "json" ? JSON.parse(input.value) as PointleshProperty : type === "boolean" ? (input as HTMLInputElement).checked : type === "number" ? Number(input.value) : input.value;
      edit(key, next); status.textContent = `Updated ${schema?.label ?? key}.`;
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
  });
  label.append(input); return label;
}
function installStyles(document: Document) {
  if (document.getElementById("pointlesh-inspector-styles")) return;
  const style = document.createElement("style"); style.id = "pointlesh-inspector-styles";
  // Use Scene Designer's theme when embedded, with the same defaults for the standalone inspector.
  style.textContent = `
.pointlesh-inspector,.pointlesh-native-area-context{
  --pointlesh-bg:var(--sd-bg,rgba(20,24,32,.97));
  --pointlesh-bg-soft:var(--sd-bg-soft,#1b2230);
  --pointlesh-panel:var(--sd-panel,#273142);
  --pointlesh-border:var(--sd-border,#303949);
  --pointlesh-border-strong:var(--sd-border-strong,#58657a);
  --pointlesh-text:var(--sd-text,#f5f7fb);
  --pointlesh-muted:var(--sd-muted,#b9c1cf);
  --pointlesh-accent:var(--sd-accent,#8bb8ff);
  color:var(--pointlesh-text);
  font:13px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
.pointlesh-inspector{box-sizing:border-box;width:330px;max-height:80vh;overflow:auto;background:var(--pointlesh-bg);border:1px solid var(--pointlesh-border);border-radius:8px;z-index:10001;box-shadow:0 10px 45px #0008}
.pointlesh-inspector *,.pointlesh-native-area-context *{box-sizing:border-box}
.pointlesh-inspector-title{padding:14px 16px;font-weight:700;border-bottom:1px solid var(--pointlesh-border)}
.pointlesh-inspector-body,.pointlesh-inspector-toolbar{padding:12px;display:grid;gap:10px}
.pointlesh-inspector-toolbar{grid-template-columns:1fr 1fr 1.4fr;border-bottom:1px solid var(--pointlesh-border)}
.pointlesh-inspector h3,.pointlesh-inspector p{margin:0}
:is(.pointlesh-inspector,.pointlesh-native-area-context) :is(input,textarea,select,button){font:inherit;color:var(--pointlesh-text);background:#111722;border:1px solid var(--pointlesh-border);border-radius:6px;padding:7px;width:100%;min-width:0}
:is(.pointlesh-inspector,.pointlesh-native-area-context) button{cursor:pointer;background:var(--pointlesh-panel);border-color:var(--pointlesh-border-strong)}
:is(.pointlesh-inspector,.pointlesh-native-area-context) button:hover{background:#2d384b;border-color:var(--pointlesh-accent)}
:is(.pointlesh-inspector,.pointlesh-native-area-context) button:disabled{opacity:.45;cursor:default}
:is(.pointlesh-inspector,.pointlesh-native-area-context) :is(input,textarea,select,button):focus-visible{outline:2px solid var(--pointlesh-accent);outline-offset:1px}
.pointlesh-inspector-field{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:8px}
:is(.pointlesh-inspector,.pointlesh-native-area-context) input[type=checkbox]{width:20px;height:20px;justify-self:end;accent-color:var(--pointlesh-accent)}
.pointlesh-inspector-help,.pointlesh-inspector-status{color:var(--pointlesh-muted);font-size:12px}
.pointlesh-inspector-status{padding:0 12px 12px}
.pointlesh-inspector-extension>input,.pointlesh-inspector-extension>textarea,.pointlesh-inspector-extension>button{margin-top:8px}
.pointlesh-inspector textarea{min-height:64px;resize:vertical}
.pointlesh-inspector summary{cursor:pointer;color:var(--pointlesh-text)}
.pointlesh-animations{display:grid;gap:10px;border-block:1px solid var(--pointlesh-border);padding-block:12px}
.pointlesh-animations h4{margin:0;font-size:13px}
.pointlesh-animation-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.pointlesh-animation-tabs [aria-selected=true]{background:#253b5d;color:var(--pointlesh-text);border-color:var(--pointlesh-accent)}
.pointlesh-animation-slot{display:grid;gap:7px;margin:0;padding:8px;border:1px solid var(--pointlesh-border);border-radius:6px;min-width:0}
.pointlesh-animation-slot legend{padding:0 5px;color:var(--pointlesh-muted);font-size:12px}
.pointlesh-animation-slot select{font-size:11px;min-width:0}
.pointlesh-animation-footer{display:flex;justify-content:space-between;align-items:center;gap:8px}
.pointlesh-animation-flip{display:flex;align-items:center;gap:7px}
.pointlesh-animation-flip input[type=checkbox]{margin:0}
.pointlesh-animation-footer button{width:auto;font-size:11px;padding:4px 8px}
.pointlesh-area-capabilities{display:grid;gap:10px;border-block:1px solid var(--pointlesh-border);padding-block:12px}
.pointlesh-area-capabilities h4{margin:0;font-size:13px}
.pointlesh-area-settings{display:grid;gap:8px;border-left:2px solid var(--pointlesh-border-strong);padding-left:10px;margin:0 0 5px 8px}
`;
  // Dock resize grips scroll through native content at z-index 20. Keep this inset card interactive above them.
  style.textContent += `
.pointlesh-native-area-context{position:relative;z-index:21;margin-bottom:12px;padding:10px;border:1px solid var(--pointlesh-border);border-radius:7px;background:var(--pointlesh-bg-soft);font-size:12px;line-height:1.45}
.pointlesh-native-area-context .pointlesh-area-capabilities{border:0;padding:0}
.pointlesh-native-area-context h4,.pointlesh-native-area-context p{margin:0}
.pointlesh-native-area-context :is(input,select,button){padding:6px}
.pointlesh-native-area-context .pointlesh-inspector-help{font-size:11px}
.pointlesh-native-area-history{display:flex;gap:6px;margin-top:10px}
.pointlesh-native-area-context+.scene-designer__stack>[hidden]{display:none!important}
`;
  document.head.append(style);
}
