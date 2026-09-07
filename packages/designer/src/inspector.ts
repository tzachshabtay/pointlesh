import { registerInGameDesignerPanel } from "@ai-game-assets/core";
import {
  isPointleshPrefab,
  assertJSON,
  resolvePointleshScene,
  type PointleshPrefabDefinition,
  type PointleshPrefabInstance,
  type PointleshProperties,
  type PointleshProperty,
  type PointleshPropertySchema,
  type PointleshResolvedScene,
} from "@pointlesh/core";
import { prefabInstanceIdFromAttributeId, resolvePrefabNumber, type SceneDesignerManifest, type SceneSelection } from "@scene-designer/core";
import { installSceneDesigner, type SceneDesigner, type SceneDesignerOptions } from "@scene-designer/designer";

export type PointleshInspectorOptions = {
  designer: SceneDesigner;
  mount?: HTMLElement;
  /** Runs for inspector edits and inspector undo/redo. Native edits keep their own callback. */
  onManifestChange?(manifest: SceneDesignerManifest): void;
  onPreview?(scene: PointleshResolvedScene): void;
};
export type PointleshInspector = {
  root: HTMLElement;
  /** Call from native Scene Designer's onManifestChange and onSelectionChange. */
  sync(): void;
  open(): void;
  close(): void;
  setProperties(instanceId: string, properties: PointleshProperties): void;
  setPrefabProperties(prefabId: string, properties: PointleshProperties): void;
  setBehaviors(instanceId: string, behaviorIds: string[]): void;
  undo(): void;
  redo(): void;
  exportManifest(): string;
  destroy(): void;
};
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
  inspector = installPointleshInspector({ designer, mount: options.inspectorMount ?? options.mount, onPreview: options.onPreview });
  return { designer, inspector, destroy() { inspector?.destroy(); designer.destroy(); } };
}

type Target = { prefab: PointleshPrefabDefinition; instance?: PointleshPrefabInstance };

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
  let manualInstanceId: string | undefined;
  let selectionKey = "";
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
  function sync() {
    if (restoring) return;
    const next = designer.getManifest(), json = JSON.stringify(next);
    if (json !== lastJson) {
      past.push(structuredClone(last)); if (past.length > 100) past.shift();
      future.length = 0; last = next; lastJson = json;
    }
    const nextSelectionKey = JSON.stringify(designer.getSelection());
    if (selectionKey !== nextSelectionKey) { manualInstanceId = undefined; selectionKey = nextSelectionKey; }
    render(); preview();
  }
  function setTargetProperties(next: SceneDesignerManifest, target: Target, properties: PointleshProperties) {
    for (const [key, value] of Object.entries(properties)) {
      assertProperty(key, value, target.prefab.pointlesh.propertySchema?.[key]);
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
    apply(next);
  }

  function targetFromSelection(manifest: SceneDesignerManifest): Target | undefined {
    if (manualInstanceId) return instanceTarget(manifest, manualInstanceId);
    const selection = designer.getSelection();
    if (!selection) return;
    if ("prefabId" in selection) {
      const prefab = manifest.prefabs?.[selection.prefabId];
      return prefab && isPointleshPrefab(prefab) ? { prefab } : undefined;
    }
    const id = instanceIdFromSelection(selection);
    return id ? instanceTarget(manifest, id) : undefined;
  }

  function render() {
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
    for (const [key, value] of Object.entries(values)) body.append(propertyField(document, key, value, schemas[key], edit, status));
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
    setProperties(instanceId, properties) {
      const next = designer.getManifest(), target = instanceTarget(next, instanceId);
      if (!target) throw new Error(`Unknown Pointlesh instance "${instanceId}".`);
      setTargetProperties(next, target, properties);
    },
    setPrefabProperties(prefabId, properties) {
      const next = designer.getManifest(), target = prefabTarget(next, prefabId);
      if (!target) throw new Error(`Unknown Pointlesh prefab "${prefabId}".`);
      setTargetProperties(next, target, properties);
    },
    setBehaviors(instanceId, behaviorIds) {
      const next = designer.getManifest(), target = instanceTarget(next, instanceId);
      if (!target?.instance) throw new Error(`Unknown Pointlesh instance "${instanceId}".`);
      if (behaviorIds.some(id => typeof id !== "string" || !id.trim())) throw new Error("Behavior IDs must be nonempty strings.");
      target.instance.pointlesh ??= {}; target.instance.pointlesh.behaviors = [...new Set(behaviorIds)]; apply(next);
    },
    undo, redo, exportManifest() { return JSON.stringify(designer.getManifest(), null, 2) + "\n"; },
    destroy() { dock.destroy(); root.remove(); },
  };
  sync();
  return api;
}

function instanceTarget(manifest: SceneDesignerManifest, instanceId: string): Target | undefined {
  for (const scene of Object.values(manifest.scenes)) for (const layer of scene.layers) {
    const instance = layer.prefabs?.find(candidate => candidate.id === instanceId) as PointleshPrefabInstance | undefined;
    if (!instance) continue;
    const target = prefabTarget(manifest, instance.prefabId);
    if (target) return { ...target, instance };
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
  style.textContent = `.pointlesh-inspector{box-sizing:border-box;width:330px;max-height:80vh;overflow:auto;background:#152620;color:#edf5e7;border:1px solid #647757;border-radius:12px;font:13px/1.5 system-ui,sans-serif;z-index:10001;box-shadow:0 10px 45px #0008}.pointlesh-inspector *{box-sizing:border-box}.pointlesh-inspector-title{padding:14px 16px;font-weight:700;color:#f5d58b;border-bottom:1px solid #344c3d}.pointlesh-inspector-body,.pointlesh-inspector-toolbar{padding:12px;display:grid;gap:10px}.pointlesh-inspector-toolbar{grid-template-columns:1fr 1fr 1.4fr;border-bottom:1px solid #344c3d}.pointlesh-inspector h3,.pointlesh-inspector p{margin:0}.pointlesh-inspector input,.pointlesh-inspector textarea,.pointlesh-inspector select,.pointlesh-inspector button{font:inherit;color:#edf5e7;background:#213a2d;border:1px solid #617358;border-radius:5px;padding:7px;width:100%}.pointlesh-inspector button{cursor:pointer}.pointlesh-inspector button:hover{background:#39513b}.pointlesh-inspector button:disabled{opacity:.45;cursor:default}.pointlesh-inspector input:focus,.pointlesh-inspector textarea:focus,.pointlesh-inspector select:focus{outline:2px solid #dbbd70;outline-offset:1px}.pointlesh-inspector-field{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:8px}.pointlesh-inspector input[type=checkbox]{width:20px;height:20px;justify-self:end}.pointlesh-inspector-help,.pointlesh-inspector-status{color:#b9c8b3;font-size:12px}.pointlesh-inspector-status{padding:0 12px 12px}.pointlesh-inspector-extension>input,.pointlesh-inspector-extension>textarea,.pointlesh-inspector-extension>button{margin-top:8px}.pointlesh-inspector textarea{min-height:64px;resize:vertical}.pointlesh-inspector summary{cursor:pointer;color:#f5d58b}`;
  document.head.append(style);
}
