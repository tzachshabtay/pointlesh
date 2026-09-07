import { installPointleshInspector, type PointleshInspector } from "@pointlesh/designer";
import type { PointleshResolvedScene } from "@pointlesh/core";
import { installPhaserSceneDesigner, type PhaserSceneDesignerOptions, type InstalledPhaserSceneDesigner } from "@scene-designer/phaser";

export type PhaserPointleshDesignerOptions = PhaserSceneDesignerOptions & {
  inspectorMount?: HTMLElement;
  onPreview?: (scene: PointleshResolvedScene) => void;
};
export type InstalledPhaserPointleshDesigner = InstalledPhaserSceneDesigner & {
  inspector: PointleshInspector;
};

/** Native draggable vertices, prefab editing and minimap, plus adventure properties. */
export function installPhaserPointleshDesigner(options: PhaserPointleshDesignerOptions): InstalledPhaserPointleshDesigner {
  let inspector: PointleshInspector | undefined;
  const native = installPhaserSceneDesigner({
    ...options,
    onManifestChange(manifest) {
      options.onManifestChange?.(manifest);
      inspector?.sync();
    },
    onSceneChange(sceneId, definition) {
      options.onSceneChange?.(sceneId, definition);
      inspector?.sync();
    },
  });
  inspector = installPointleshInspector({
    designer: native.designer,
    mount: options.inspectorMount ?? options.mount,
    onPreview: options.onPreview,
  });
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
    inspector?.destroy();
    native.destroy();
  };
  options.scene.events.on("update", syncSelection);
  options.scene.events.once("shutdown", destroy);
  return { ...native, inspector, destroy };
}
