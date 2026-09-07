# @pointlesh/designer

Scene Designer plus live adventure properties for Pointlesh prefabs. Edit polygons, reusable defaults, numeric movement/area settings, JSON properties, and behavior IDs while the game runs.

```ts
import { installPointleshDesigner } from '@pointlesh/designer';

const tools = installPointleshDesigner({
  manifest: sceneManifest,
  aiAssets: assetManifest,
  onManifestChange(manifest) { sceneManifest = manifest; },
  onPreview(room) { updateRuntime(room); },
});
// When tearing down:
tools.destroy();
```

Use `installPointleshInspector({ designer, onPreview })` to attach the Adventure panel to an existing native designer. Forward native manifest, scene, and selection changes to `inspector.sync()`. For Phaser, use `@pointlesh/phaser`'s combined installer.

The inspector provides `setProperties(instanceId, patch)`, `setPrefabProperties(prefabId, patch)`, `setBehaviors(instanceId, ids)`, `undo()`, `redo()`, `exportManifest()`, and lifecycle methods. Numeric property edits go to native attribute overrides; other JSON properties stay in the Pointlesh sidecar. All edits propagate through the native designer's manifest change callback.

See the repository's [prefab documentation](https://github.com/tzachshabtay/pointlesh/blob/main/docs/prefabs.md) for schema and extension examples.

## Native shapes and directional characters

Area instances expose **Edit shape**, which selects the original Scene Designer area attribute and its canvas tools. Closed shapes use native selection mode for vertex dragging, edge insertion/deletion and quadratic curves; empty shapes enter native drawing mode. No parallel geometry format or rectangle editor is used.

Character instances and prefab definitions expose Idle/Walk/Speak tabs with front/back/left/right slots, optional diagonal slots, asset and animation selectors, and per-slot horizontal Flip. Sparse instance overrides inherit untouched slots; **Use prefab**, undo/redo and JSON export retain that behavior.

Pass `aiAssets` to `installPointleshInspector` (the Phaser wrapper supplies it automatically). Call `inspector.setAiAssets(manifest)` after asset catalog edits so pickers include new native linked animation states. `inspector.editShape(instanceId, attributeId?)` opens native shape tooling programmatically. Assigned clips obtain timing from AI Assets; `walkStep` remains the character's movement-per-frame setting.

Area properties are grouped under **Walkable**, **Character scale**, **Camera zoom** and **Walk-behind** switches. Enable any combination on a shared native shape. Scale and zoom have independent axes/endpoints, and disabled settings remain stored for re-enabling. Instance overrides, undo and JSON export retain each role independently.
