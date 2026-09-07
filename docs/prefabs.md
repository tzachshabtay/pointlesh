# Pointlesh prefabs

Pointlesh's default catalog contains Area, Hotspot, Object and Character prefabs, all actual `ScenePrefabDefinition` values. Register them in a schema-version-2 scene manifest and use Scene Designer's existing Scenes and Prefabs panels to draw polygons, move sprites, change numeric values, and edit reusable defaults.

| Factory | Native attributes | Adventure properties |
| --- | --- | --- |
| `createAreaPrefab` | `area` polygon, scale and zoom endpoints, `smoothing`, `baseline` | `enabled`, `walkable`, `scaleEnabled`, `zoomEnabled`, `walkBehindEnabled`, `scaleAxis`, `zoomAxis` |
| `createHotspotPrefab` | `area`, `approachX`, `approachY`, `approachRadius` | `enabled`, `label`, `cursor` |
| `createObjectPrefab` | `object` sprite | `enabled`, `interactive`, `ignoreScaling`, `label` |
| `createCharacterPrefab` | `object`, `speed`, `walkStep`, `frameDurationMs`, `frameCount` | `movementLinkedToAnimation`, `facing`, `directions`, object properties |

One Area can supply any combination of navigation, character scaling, camera zoom and walk-behind scenery. Each role has its own enable switch; global `enabled` disables all roles. The Adventure inspector groups these switches and shows only the relevant settings. Switching a role off preserves its values and geometry. The demo combines walking, scale and zoom on each room's ground polygon; foreground occlusion uses another instance of the same Area prefab because its outline differs.

Numeric attributes are read from Scene Designer's resolved defaults and overrides. `minScale`/`minZoom` mean the factor at the area's top edge (or left edge for an X axis); `maxScale`/`maxZoom` mean the factor at its bottom/right edge. They name interpolation endpoints, so the first value may be larger than the second. `scaleAxis` and `zoomAxis` can be chosen independently. Walk-behind baselines use scene Y coordinates. Object positions represent the feet: Scene Designer uses `anchorX: 0.5, anchorY: 0`, corresponding to Phaser origin `(0.5, 1)`.

```ts
import { defineSceneManifest, createLayer } from '@scene-designer/core';
import {
  pointleshPrefabs, createPointleshInstance,
  resolvePointleshScene, walkablePolygons,
} from '@pointlesh/core';

const layer = createLayer({ id: 'main', name: 'Main' });
layer.prefabs = [createPointleshInstance({
  id: 'village-path',
  prefabId: 'pointlesh.area',
  properties: { walkable: true, scaleEnabled: true, zoomEnabled: true },
  overrides: {
    area: {
      closed: true,
      vertices: [
        { id: 'a', x: 20, y: 180 }, { id: 'b', x: 600, y: 180 },
        { id: 'c', x: 600, y: 320 }, { id: 'd', x: 20, y: 320 },
      ],
    },
  },
})];
const manifest = defineSceneManifest({
  schemaVersion: 2,
  prefabs: pointleshPrefabs({
    objectAssetId: 'item.lantern',
    characterAssetId: 'character.dwarf',
  }),
  scenes: { village: { id: 'village', name: 'Village', width: 640, height: 360, layers: [layer] } },
});
const room = resolvePointleshScene(manifest, 'village');
const navigationPolygons = walkablePolygons(room);
```

Supply asset IDs from your `@ai-game-assets/core` manifest when you instantiate objects or characters. The default catalog's placeholder asset IDs are convenience defaults, not bundled artwork. Newly created Area definitions have empty shapes and all roles disabled; draw and close an instance's shape and enable the desired roles. Curved edges are sampled into polygons when resolved.

`pointleshAreaCapabilities(area)` reads effective roles, including old manifests. `walkablePolygons(room)` returns the union's input polygons for enabled, closed walkable areas; turning off walkability on one overlapping region does not subtract another region's ground. Scale and zoom resolve independently: the last eligible region in manifest order wins for each enabled effect. A later region that only scales characters does not override another region's zoom.

The earlier `createWalkableAreaPrefab`, `createScaleAreaPrefab`, `createZoomAreaPrefab` and `createWalkBehindAreaPrefab` exports remain supported for existing clients and saved manifests. New code should use `createAreaPrefab({ walkable: true, scaleEnabled: true, zoomEnabled: true, ... })`. If existing code builds a catalog and references IDs such as `pointlesh.walkable`, use `pointleshPrefabs({ includeLegacyAreas: true })` during migration. Legacy `axis` is still honored. New default catalogs expose the single Area template.

## Extending a prefab

Scene Designer stores native object, area, platform, and number attributes. Pointlesh adds a JSON sidecar called `pointlesh` containing the prefab kind, custom properties, behavior IDs, and optional property schemas. Upstream validation accepts this sidecar and its cloning, editing, promotion, and export preserve it. No fork of Scene Designer is required.

```ts
import { createHotspotPrefab, extendPointleshPrefab } from '@pointlesh/core';

const lockedDoor = extendPointleshPrefab(createHotspotPrefab(), {
  id: 'my-game.locked-door',
  name: 'Locked door',
  properties: { keyItem: 'brass-key', locked: true, message: 'It is locked.' },
  behaviors: ['my-game.locked-door'],
  propertySchema: {
    keyItem: { type: 'string', label: 'Required inventory item' },
    locked: { type: 'boolean', label: 'Starts locked' },
    message: { type: 'string', label: 'Locked response' },
  },
});
```

`extendPointleshPrefab` creates a new definition by merging native attributes by ID, shallow-merging property and schema maps, and combining unique behavior IDs. This is definition composition performed when building the manifest. Subsequent edits to the original base definition do not mutate an already-created derived definition. Instances of the resulting prefab retain Scene Designer's live partial inheritance: omitted native fields use the current prefab defaults. Set a field on an instance only when it should differ from those defaults.

Instances can add property overrides and behavior IDs through `createPointleshInstance({ properties, behaviors, ... })`. JSON property values may be nested objects or arrays. For new visual controls, append native attributes through the `attributes` factory option. Register executable behavior implementations in your game's behavior registry; serialized manifests and saves contain only their stable IDs. Behaviors can add puzzle rules, object interactions, or optional area restrictions without changing the built-in prefab factories.

## Live editing

`@pointlesh/designer` installs the normal Scene Designer panels together with an Adventure panel for custom properties, behavior IDs, history, and JSON export:

```ts
import { installPointleshDesigner } from '@pointlesh/designer';

const tools = installPointleshDesigner({
  manifest,
  aiAssets,
  defaultSceneId: 'village',
  onManifestChange(nextManifest) { manifest = nextManifest; },
  onPreview(room) { updateGameGeometry(room); },
});
```

If an engine adapter already installed Scene Designer, call `installPointleshInspector({ designer, onPreview })` instead of installing a second designer. Call its `sync()` from native manifest, scene, and selection change callbacks. The Phaser package provides this composition. Native controls retain their own undo/redo; the Adventure panel's history captures both observed native edits and adventure-property edits, and restores complete manifests. Keep native change callbacks connected so the runtime rebuilds its geometry after undo or redo.

`resolvePointleshScene` returns a room with `entities`, `areas`, and `objects`. Each entity's `id` is its stable prefab instance ID; `areaId` and `objectId` are the native `instance::attribute` IDs used by Scene Designer. The result merges inherited properties and instance properties, then resolves native numeric attributes over them. Areas include sampled `polygon` points; objects include position, asset ID, scale, rotation, and anchors. Visibility at the layer, instance, and attribute level plus the `enabled` property controls whether a resolved element is enabled. Locked designer elements still participate in gameplay.

The library leaves game-specific interaction code in TypeScript. Rebuild geometry and visual settings from `onPreview`, while preserving transient runtime state such as the player's current walking position. To persist designer changes in source, run the local dev servers and use Scene Designer's promotion action, or export the complete JSON manifest from the Adventure panel.
