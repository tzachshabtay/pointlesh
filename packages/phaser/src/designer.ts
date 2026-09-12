import { installPointleshInspector, type PointleshInspector } from "@pointlesh/designer";
import type { PointleshResolvedScene } from "@pointlesh/core";
import { installPhaserSceneDesigner, type PhaserSceneDesignerOptions, type InstalledPhaserSceneDesigner } from "@scene-designer/phaser";
import { installPhaserAreaBaseline } from "./area-baseline.js";
import { installPhaserAreaEdgeHandles } from "./area-edge-handles.js";

export type PhaserPointleshDesignerOptions = PhaserSceneDesignerOptions & {
  inspectorMount?: HTMLElement;
  onPreview?: (scene: PointleshResolvedScene) => void;
  /** Game-only HTML overlays to hide and make inert during scene/prefab canvas editing. */
  gameOverlays?: readonly HTMLElement[];
};
export type InstalledPhaserPointleshDesigner = InstalledPhaserSceneDesigner & {
  inspector: PointleshInspector;
  areaBaseline: ReturnType<typeof installPhaserAreaBaseline>;
  areaEdgeHandles: ReturnType<typeof installPhaserAreaEdgeHandles>;
};

/** Native draggable vertices, prefab editing and minimap, plus adventure properties. */
export function installPhaserPointleshDesigner(options: PhaserPointleshDesignerOptions): InstalledPhaserPointleshDesigner {
  let inspector: PointleshInspector | undefined;
  let nativeEditHistory = true;
  // Canvas handles cannot paint above HTML siblings, regardless of Phaser depth.
  // Suspend the host's game overlays while editing, preserving their layout and
  // hidden state so gameplay can resume exactly where it left off.
  const suspendedOverlays = new Map<HTMLElement, { visibility: string; priority: string; inert: boolean }>();
  const syncGameOverlays = (open: boolean) => {
    if (open) {
      for (const element of options.gameOverlays ?? []) {
        if (suspendedOverlays.has(element)) continue;
        suspendedOverlays.set(element, {
          visibility: element.style.getPropertyValue('visibility'),
          priority: element.style.getPropertyPriority('visibility'),
          inert: element.inert,
        });
        element.style.setProperty('visibility', 'hidden', 'important');
        element.inert = true;
      }
    } else {
      for (const [element, previous] of suspendedOverlays) {
        if (previous.visibility) element.style.setProperty('visibility', previous.visibility, previous.priority);
        else element.style.removeProperty('visibility');
        element.inert = previous.inert;
      }
      suspendedOverlays.clear();
    }
  };
  const native = installPhaserSceneDesigner({
    ...options,
    onOpenChange(open) {
      syncGameOverlays(open);
      options.onOpenChange?.(open);
    },
    onManifestChange(manifest) {
      options.onManifestChange?.(manifest);
      inspector?.sync({ history: nativeEditHistory });
    },
    onSceneChange(sceneId, definition) {
      options.onSceneChange?.(sceneId, definition);
      inspector?.sync();
    },
  });
  syncGameOverlays(native.designer.isOpen());
  inspector = installPointleshInspector({
    designer: native.designer,
    aiAssets: options.aiAssets,
    mount: options.inspectorMount ?? options.mount,
    onPreview: options.onPreview,
  });
  // Native drags mark only their first update as a history checkpoint. Preserve
  // that grouping in the contextual inspector's undo stack as well.
  const updateArea = native.designer.updateArea;
  const updateAreaVertex = native.designer.updateAreaVertex;
  const withNativeHistory = (history: boolean | undefined, update: () => void) => {
    const previous = nativeEditHistory;
    nativeEditHistory = history !== false;
    try { update(); } finally { nativeEditHistory = previous; }
  };
  const groupedArea: typeof updateArea = (id, patch, editOptions) => withNativeHistory(editOptions?.history, () => updateArea.call(native.designer, id, patch, editOptions));
  const groupedVertex: typeof updateAreaVertex = (id, vertexId, patch, editOptions) => withNativeHistory(editOptions?.history, () => updateAreaVertex.call(native.designer, id, vertexId, patch, editOptions));
  native.designer.updateArea = groupedArea;
  native.designer.updateAreaVertex = groupedVertex;
  const areaBaseline = installPhaserAreaBaseline({ scene: options.scene, designer: native.designer, inspector, depth: (options.areaDepth ?? 10_000) + 1 });
  const areaEdgeHandles = installPhaserAreaEdgeHandles({ scene: options.scene, designer: native.designer });
  // The upstream Phaser adapter owns its selection callback. Observe only its tiny
  // selection value, and leave its canvas handles and input lifecycle intact.
  let selection = JSON.stringify(native.designer.getSelection());
  const syncSelection = () => {
    const next = JSON.stringify(native.designer.getSelection());
    if (next !== selection) { selection = next; inspector?.sync(); }
  };
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    options.scene.events.off("update", syncSelection);
    options.scene.events.off("shutdown", destroy);
    areaBaseline.destroy();
    areaEdgeHandles.destroy();
    if (native.designer.updateArea === groupedArea) native.designer.updateArea = updateArea;
    if (native.designer.updateAreaVertex === groupedVertex) native.designer.updateAreaVertex = updateAreaVertex;
    inspector?.destroy();
    native.destroy();
    syncGameOverlays(false);
  };
  options.scene.events.on("update", syncSelection);
  options.scene.events.once("shutdown", destroy);
  return { ...native, inspector, areaBaseline, areaEdgeHandles, destroy };
}
