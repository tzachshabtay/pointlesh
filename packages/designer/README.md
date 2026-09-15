# @pointlesh/designer

Scene Designer plus live adventure properties for reusable Pointlesh prefabs and scene-owned areas. Edit polygons, reusable defaults, numeric movement/area settings, JSON properties, and behavior IDs while the game runs.

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

Use `installPointleshInspector({ designer, onPreview })` to embed Pointlesh property sections in an existing native designer’s Scenes and Prefabs panels. Forward native manifest, scene, and selection changes to `inspector.sync()`. For Phaser, use `@pointlesh/phaser`'s combined installer.

The inspector provides `setProperties(entityId, patch)`, `setPrefabProperties(prefabId, patch)`, `setBehaviors(entityId, ids)`, `undo()`, `redo()`, `exportManifest()`, and lifecycle methods. Entity IDs can identify character/object instances or native scene areas. Prefab numeric edits use native attributes and overrides; native area settings and custom JSON properties stay on the area’s Pointlesh sidecar. All edits propagate through the native designer's manifest change callback. The native undo/redo methods and keyboard shortcuts use the inspector's combined history, including grouped canvas drags. Destroying the inspector restores the native methods. `open()` and `close()` target the native scene panel; no standalone Adventure tab is registered.

See the repository's [prefab documentation](https://github.com/tzachshabtay/pointlesh/blob/main/docs/prefabs.md) for schema and extension examples.

The same controls edit prefab defaults or scene-instance overrides according to the native selection. **Edit prefab** jumps from an instance to its definition. Standard properties display **Inherited from prefab** or **Instance override** and a **Reset to prefab** action. Directional animations retain per-slot **Use prefab** actions. Numeric controls appear once alongside their related properties, while their data remains in native numeric attributes.

The Prefabs browser and the scene's **Add prefab** chooser use folders and breadcrumbs. Pointlesh definitions default to **Characters** or **Objects**; set `editor: { folderPath: ['Characters', 'Orcs'] }` when creating or extending a prefab for deeper folders. Non-Pointlesh definitions remain available under **Other**. **Edit prefab** opens the selected definition's folder automatically.

The generic catalog entries are creation templates, hidden from both browsers. **New prefab** creates a named definition from one of these templates; then add instances in Scenes. `pointleshPrefabs()` marks templates automatically, and `extendPointleshPrefab()` produces a visible definition. Explicit `editor.template` metadata takes precedence over the legacy `pointlesh.<kind>` ID convention. These are authoring settings, separate from runtime properties, and are preserved through JSON export and promotion.

Collapsible **Directional animations**, **Movement**, **Properties** and **Custom properties & behaviors** sections keep the inspector manageable. Client-defined `propertySchema` fields and JSON extensions use the same controls in both views; behavior IDs remain source-registered game logic. **Undo**, **Redo** and **Export JSON** are at the end of the embedded inspector.

## Native shapes and directional characters

Scene layers list **Areas** and **Hotspots** alongside prefab instances. **Add area** and **Add hotspot** create a named native polygon and start drawing. These are scene-owned data, with editable names, properties, schemas and behavior IDs; they have no prefab definition or inheritance controls. **Edit shape** selects the original Scene Designer polygon and its canvas tools. Closed shapes use native selection mode for vertex dragging, edge insertion/deletion and quadratic curves; empty shapes enter native drawing mode. No parallel geometry format or rectangle editor is used.

Character instances and prefab definitions expose Idle/Walk/Speak tabs with front/back/left/right slots, optional diagonal slots, asset and animation selectors, and per-slot horizontal Flip. Sparse instance overrides inherit untouched slots; **Use prefab**, undo/redo and JSON export retain that behavior.

Pass `aiAssets` to `installPointleshInspector` (the Phaser wrapper supplies it automatically). Call `inspector.setAiAssets(manifest)` after asset catalog edits so pickers include new native linked animation states. `inspector.editShape(entityId, attributeId?)` opens native shape tooling programmatically. Assigned clips obtain timing from AI Assets; `walkStep` remains the character's movement-per-frame setting.

Area properties are grouped under **Walkable**, **Character scale**, **Camera zoom** and **Walk-behind** switches. Enable any combination on a shared native shape. Scale and zoom have independent axes/endpoints, and disabled settings remain stored for re-enabling. Undo and JSON export retain each role independently.
