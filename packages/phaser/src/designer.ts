import { installPointleshInspector, type PointleshInspector } from "@pointlesh/designer";
import type { PointleshResolvedScene } from "@pointlesh/core";
import { installPhaserSceneDesigner, type PhaserSceneDesignerOptions, type InstalledPhaserSceneDesigner } from "@scene-designer/phaser";
import { installPhaserAreaBaseline } from "./area-baseline.js";
import { installPhaserAreaEdgeHandles } from "./area-edge-handles.js";

export type PhaserPointleshDesignerOptions = PhaserSceneDesignerOptions & {
  inspectorMount?: HTMLElement;
  onPreview?: (scene: PointleshResolvedScene) => void;
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
  const native = installPhaserSceneDesigner({
    ...options,
    onManifestChange(manifest) {
      options.onManifestChange?.(manifest);
      inspector?.sync({ history: nativeEditHistory });
    },
    onSceneChange(sceneId, definition) {
      options.onSceneChange?.(sceneId, definition);
      inspector?.sync();
    },
  });
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
  };
  options.scene.events.on("update", syncSelection);
  options.scene.events.once("shutdown", destroy);
  return { ...native, inspector, areaBaseline, areaEdgeHandles, destroy };
}
