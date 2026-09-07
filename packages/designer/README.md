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
