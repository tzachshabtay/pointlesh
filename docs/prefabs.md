# Pointlesh prefabs

Characters, objects and named points are Scene Designer prefabs. Areas and hotspots belong directly to one scene, stored as native `SceneArea` values in `layer.areas`. Both use the same extensible Pointlesh properties and behavior IDs.

| Factory | Storage | Adventure settings |
| --- | --- | --- |
| `createPointleshArea({ kind: 'area' })` | Scene layer's native areas | Walking, character scale, camera zoom, walk-behind, baseline |
| `createPointleshArea({ kind: 'hotspot' })` | Scene layer's native areas | Label, cursor, approach point and radius |
| `createPointPrefab` | Reusable prefab with X/Y number attributes | Named coordinate, live move/walk preview |
| `createObjectPrefab` | Reusable prefab definition | Sprite, interaction, scaling, navigation |
| `createCharacterPrefab` | Reusable prefab definition | Object settings, directional animations and movement |

One area can supply any combination of navigation, character scaling, camera zoom and walk-behind scenery. Each role has its own enable switch; global `enabled` disables all roles. The inspector shows the relevant settings. Switching a role off preserves its values and geometry. Use separate areas when their boundaries differ.

`minScale`/`minZoom` are the factors at the area's top edge (or left edge for an X axis); `maxScale`/`maxZoom` are the factors at its bottom/right edge. These are interpolation endpoints, so the first value may be larger than the second. Scale and zoom axes are independent. Walk-behind baselines use scene Y coordinates. Object positions represent the feet: Scene Designer uses `anchorX: 0.5, anchorY: 0`, corresponding to Phaser origin `(0.5, 1)`.

```ts
import { defineSceneManifest, createLayer } from '@scene-designer/core';
import {
  createPointleshArea, resolvePointleshScene, walkablePolygons,
} from '@pointlesh/core';

const layer = createLayer({ id: 'main', name: 'Main' });
layer.areas = [createPointleshArea({
  id: 'village-path', name: 'Village path',
  walkable: true, scaleEnabled: true, minScale: 0.8, maxScale: 1.2,
  closed: true,
  vertices: [
    { x: 20, y: 180 }, { x: 600, y: 180 },
    { x: 600, y: 320 }, { x: 20, y: 320 },
  ],
  properties: { surface: 'gravel' },
  behaviors: ['my-game.footsteps'],
})];
const manifest = defineSceneManifest({
  schemaVersion: 2,
  scenes: { village: { id: 'village', name: 'Village', width: 640, height: 360, layers: [layer] } },
});
const room = resolvePointleshScene(manifest, 'village');
const navigationPolygons = walkablePolygons(room);
```

For hotspots, use `createPointleshArea({ kind: 'hotspot', name: 'Forest exit', approachX: 540, approachY: 290, ... })`. New shapes start empty and open; draw and close the polygon in Scenes. Areas start with all capabilities disabled. Geometry uses native Scene Designer vertices and curves, sampled into polygons for runtime use. The `pointlesh` sidecar stores the name, capability settings, custom properties, property schemas and behaviors on the area itself.

`pointleshAreaCapabilities(area)` reads effective roles, including legacy manifests. `walkablePolygons(room)` returns enabled, closed walkable polygons; turning off one overlapping region does not subtract another region's ground. Scale and zoom resolve independently: the last eligible region in manifest order wins for each effect. A later region that only scales characters does not override another region's zoom.

`pointleshPrefabs()` supplies hidden Object, Character and Point creation templates. Supply asset IDs from your AI Assets manifest when creating game definitions; placeholder IDs are not bundled artwork.

For existing projects, `migratePointleshSceneAreas(manifest)` returns a detached manifest with standalone region prefab instances converted to native scene areas. It preserves geometry, stable gameplay IDs, properties, numeric overrides and behavior order, then removes unreferenced region definitions. It is safe to rerun. Composite prefabs remain supported without being flattened. Legacy area/hotspot factories and resolution remain available; `pointleshPrefabs({ includeLegacyAreas: true })` includes the old catalog IDs while migrating. New content should use `createPointleshArea`.

## Named points and interaction walk points

`createPointPrefab({ id, name, x, y })` creates a coordinate without a sprite or polygon. Place instances with `createPointleshInstance`, give each instance a name, and override `x: { value }` / `y: { value }` as needed. `resolvePointleshScene(...).points` exposes each stable instance ID, name and position. Point markers appear only while editing; Phaser provides canvas dragging with undo/redo, visibility and lock support.

In **Prefabs → Points → New prefab**, choose **Point**, name the definition, then place it with **Scenes → Add prefab**. Select a scene point to rename it, edit X/Y, or choose a **Character** and click **Move character here** or **Walk character here**. Move teleports; Walk follows navigation to the exact coordinate. These actions preview live actors without changing their authored placements. A host supplies `onPointAction` to the engine-neutral designer, or `getCharacter(instanceId, sceneId)` to the Phaser installer.

Hotspots, objects and characters expose an optional **Walk point** dropdown. It stores `properties.walkPointId`, a point instance ID in the same scene, so renaming preserves references. Instance overrides can assign different points per room. **None (normal approach)** retains normal approach behavior, including legacy approach coordinates/offsets if present. Missing, hidden or disabled referenced points report an error rather than running an interaction from the wrong location.

```ts
import { approachPointleshEntity, resolvePointleshPoint } from '@pointlesh/core';

// The controller uses the navigation source registered by the engine adapter.
if (await approachPointleshEntity(actor, room, clickedEntity)) {
  await runInteraction(clickedEntity); // Only after arrival; interruptions return false.
}
// On room entry, the game chooses a point based on the source room.
actor.place(resolvePointleshPoint(room, entryPointId).position);
```

`pointleshApproachTarget(room, entity, livePosition?)` exposes the resolved approach target for custom integrations. `resolvePointleshWalkPoint(room, entity)` resolves only the named reference. Explicit points must be reachable exactly; they do not snap to nearby ground. `actOnPoint(controller, point, 'move' | 'walk')` powers the designer preview actions and is also available to game code.

The demo has a separate `room.entry.from-<sourceRoom>` point for every incoming connection. For example, the forest has points for arriving from Bramblehollow, the mine and the camp. Each exit hotspot shares its walk point with that doorway's entry point; pickups and other scenery have separate interaction points. Dragging a point changes subsequent arrivals and approaches immediately. The one-time migration can be rerun with `node --import tsx demos/forest/scripts/add-points.ts`; it preserves existing point edits and promoted scene content.

## Extending a prefab

Scene Designer stores native object, area, platform, and number attributes. Pointlesh adds a JSON sidecar called `pointlesh` containing the prefab kind, custom properties, behavior IDs, optional property schemas, and authoring metadata in `editor`. Upstream validation accepts this sidecar and its cloning, editing, promotion, and export preserve it. No fork of Scene Designer is required.

```ts
import { createObjectPrefab, extendPointleshPrefab } from '@pointlesh/core';

const lockedDoor = extendPointleshPrefab(createObjectPrefab({ assetId: 'object.door' }), {
  id: 'my-game.locked-door',
  name: 'Locked door',
  editor: { folderPath: ['Objects', 'Doors'] },
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

`@pointlesh/designer` embeds property and behavior controls, history, and JSON export directly in the native Scenes and Prefabs inspectors:

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

If an engine adapter already installed Scene Designer, call `installPointleshInspector({ designer, onPreview })` instead of installing a second designer. Call its `sync()` from native manifest, scene, and selection change callbacks. The Phaser package provides this composition. Native keyboard shortcuts and embedded Undo/Redo controls share a history of native edits and Pointlesh property edits, restoring complete manifests. Canvas drags remain one history entry. Keep native change callbacks connected so the runtime rebuilds its geometry after undo or redo.

`resolvePointleshScene` returns a room with `entities`, `areas`, `objects` and `points`. Character/object entities retain their prefab instance IDs and native `instance::attribute` object IDs. Scene areas have no `prefabId`, `instanceId` or `attributeId`; their `areaId` is the native polygon ID, and their stable gameplay `id` is `pointlesh.entityId` when supplied, otherwise the polygon ID. Prefab entities merge inherited properties and instance overrides; native areas read their own sidecar directly. Areas include sampled `polygon` points; objects include position, asset ID, scale, rotation, and anchors. Layer and element visibility, prefab instance visibility where applicable, and the `enabled` property determine whether a resolved element is enabled. Locked designer elements still participate in gameplay.

The library leaves game-specific interaction code in TypeScript. Rebuild geometry and visual settings from `onPreview`, while preserving transient runtime state such as the player's current walking position. To persist designer changes in source, run the local dev servers and use Scene Designer's promotion action, or export the complete JSON manifest from the embedded inspector.

## Named entities in the forest demo

The prefab browser shows **Characters**, **Objects** and **Points**, with clickable breadcrumbs. Generic templates stay hidden from browsing and placement; **New prefab** creates a named definition. Each expanded scene layer lists its own **Areas** and **Hotspots**, with **Add area** and **Add hotspot** controls that start native shape drawing.

Borin, Rowan, Mara, Orrin, Grub, Aldric, the coin, rope and mushroom each have a named prefab. Borin’s six room instances share `forest.character.borin`; NPCs use `forest.character.<actorName>` and pickups use `forest.object.<pickupId>`. Artwork, animations, shared scale/movement settings and behaviors are defaults. Sprite room coordinates and facing overrides remain instance data. Each room owns its ground, foreground and exit polygons, including their capabilities, approach points and custom behavior data. Editing an area affects that scene only.

Factories accept `editor: { template?: boolean, folderPath?: string[] }`. Folder paths default to the prefab kind's category. `pointleshPrefabs()` marks the generic templates, and `extendPointleshPrefab()` makes the result visible unless explicitly marked as another template. This metadata affects authoring only; hiding a template never removes its definition or changes existing instances.

`extendPointleshPrefab` builds a concrete definition from shared defaults; it does not establish a live inheritance link between two prefab definitions. Scene instances inherit live edits from their named prefab. The demo migration (`demos/forest/scripts/specialize-entity-prefabs.ts`) preserves resolved room data and can be rerun safely. It updates scene data only; it does not regenerate assets or reset authored placements.
