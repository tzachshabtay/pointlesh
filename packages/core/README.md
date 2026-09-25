# @pointlesh/core

Renderer-independent point-and-click adventure building blocks for TypeScript. This package uses the native AI Assets, Scene Designer and Dialog Designer data models and has no Phaser or DOM runtime dependency.

The root [installation notes](../../README.md#installation-and-compatibility) describe the current peer versions and required npm overrides when consuming the package artifacts.

## Native adventure prefabs

`pointleshPrefabs()` supplies hidden Object, Character and Point creation templates. Create reusable definitions with the individual factories and place them with `createPointleshInstance()` in a Scene Designer schema-version-2 manifest.

Areas and hotspots belong to a scene layer's `areas`, created with `createPointleshArea({ kind: 'area' | 'hotspot', ... })`. One area has independent `walkable`, `scaleEnabled`, `zoomEnabled` and `walkBehindEnabled` roles on a native polygon, with separate scale/zoom axes and endpoints. Global `enabled` disables all roles. Names, settings, custom JSON properties, schemas and behavior IDs live on the area's `pointlesh` sidecar.

`resolvePointleshScene(manifest, sceneId)` resolves native areas and prefab instances into `entities`, polygon `areas`, sprite `objects` and coordinate `points`. Native scene areas have no prefab or instance IDs. `walkablePolygons(scene)` extracts enabled, closed walking shapes; curves are sampled for runtime geometry. World coordinates have positive Y downward; object/actor positions are ground anchors.

Native `visible` (eye) and `locked` flags are editor settings only. They never disable navigation, area effects, interactions, characters or objects. Use the Pointlesh `enabled` property to disable gameplay explicitly.

`migratePointleshSceneAreas(manifest)` converts standalone legacy region instances into scene-owned areas without changing geometry, gameplay IDs or settings. Existing area/hotspot factories remain supported; pass `includeLegacyAreas: true` to `pointleshPrefabs()` if you still reference their catalog IDs while migrating. `pointleshAreaCapabilities()` supports both native and legacy area kinds.

Use `extendPointleshPrefab(base, extension)` for reusable specializations. It produces a new definition rather than a live inheritance chain between definitions. Instances still inherit omitted native fields from their selected prefab. Custom JSON properties and behavior IDs stay editable and serializable. See the [prefab guide](../../docs/prefabs.md).

## Named points

`createPointPrefab({ name, x, y })` creates native numeric X/Y attributes with no artwork or polygon. Place named instances in a scene and read them through `resolvePointleshScene(...).points`. `resolvePointleshPoint(room, instanceId)` requires an enabled point in that room. Names can change without changing IDs or references.

Point `visible` controls only its designer marker, including inherited layer visibility. Hidden points remain valid entrances and walk targets. Set the Pointlesh property `enabled: false` to disable a point for gameplay explicitly.

Hotspots and objects accept optional `walkPointId` (also editable as a property/instance override). `resolvePointleshWalkPoint(room, entity)` returns that point's coordinates or `undefined` for an unassigned reference; broken references throw. `approachPointleshEntity(controller, room, entity, livePosition?)` resolves the named point before legacy approach fields, walks to the closest reachable position to it, then faces the target. Await its boolean result before running an interaction; false indicates unavailable navigation or an interrupted walk. Bind the controller's navigation source with current floors and obstacles. `pointleshApproachTarget` exposes the same target for custom movement logic.

`actOnPoint(controller, point, 'move')` teleports immediately. `'walk'` snaps an inaccessible point to the closest reachable ground without changing the authored coordinate. These functions are renderer-independent. See the [point authoring guide](../../docs/prefabs.md#named-points-and-interaction-walk-points).

## Navigation and characters

```ts
import { CharacterController, type Polygon } from '@pointlesh/core';

const floor: Polygon = [
  { x: 0, y: 180 }, { x: 640, y: 180 },
  { x: 640, y: 360 }, { x: 0, y: 360 },
];
const actor = new CharacterController({
  id: 'hero', position: { x: 100, y: 300 }, directions: 4,
  walkStep: 7, frameDurationMs: 100, frameCount: 4,
  movementLinkedToAnimation: true,
});
const completion = actor.walkTo({ x: 500, y: 300 }, [floor]);
// In your update loop: actor.tick(deltaMs).
// Once the update loop reaches the destination: await completion === true.
```

`findPath(start, end, walkables, obstacles?)` returns an exact path including both endpoints, or `null` when unreachable. `findClosestReachablePath(start, click, walkables, obstacles?)` instead snaps inaccessible clicks to the closest point reachable from the actor, including obstacle boundaries and disconnected walkable regions. Both support polygon unions and concave outlines; malformed polygons throw. Geometry helpers include `pointInPolygon`, `isWalkable`, `isSegmentWalkable`, `clipMovementToWalkable`, `closestPointOnPolygon` and `distance`.

`CharacterController` exposes `state`, `tick`, `walkTo`, `setMovementDirection`, `approach`, `face`, `place`, `say`, `finishSpeech`, `stop`, `snapshot` and `restore`. `walkTo` snaps clicks by default; its `destination` getter reports the resolved target. Pass `{ snap: false }` as the fourth argument for an exact walk. Approach modes are `none`, `face`, `walk-if-point` and `walk`; authored approach points snap to the closest reachable ground, and implicit approaches to solid entities stop at their closest reachable boundary. Approach returns false if navigation fails or movement is interrupted. A new walk or speech replaces the previous action. Facing is independent of available art; renderers choose directional frames.

With movement linked to animation, each frame change permits a configured `walkStep` distance. Single-frame walks use continuous speed. Perspective scale can adjust travel distance. Idle, walking and speaking use a deterministic elapsed-millisecond state; the renderer must tick each actor exactly once.

Character prefabs accept typed directional animation assignments:

```ts
import { createCharacterPrefab, readCharacterAnimations, resolveCharacterAnimation } from '@pointlesh/core';

const dwarf = createCharacterPrefab({
  assetId: 'character.dwarf', directions: 4,
  animations: {
    idle: { front: { assetId: 'character.dwarf', key: 'idle-front' } },
    walk: {
      left: { assetId: 'character.dwarf', key: 'walk-left' },
      right: { assetId: 'character.dwarf', key: 'walk-left', flipX: true },
    },
    speak: { front: { assetId: 'character.dwarf', key: 'speak-front' } },
  },
});
const assignment = resolveCharacterAnimation(
  readCharacterAnimations(resolvedCharacter.properties), actor.state.activity, actor.state.facing,
);
```

Each `idle`, `walk` and `speak` map accepts `front`, `back`, `left`, `right` and optional `front-left`, `front-right`, `back-left`, `back-right` slots. `key` references a native ai-assets animation key or linked animation state; `flipX` defaults to false. Down/up logical facing maps to front/back. An absent diagonal uses its front/back view; absent walk/speak art falls back to idle for that facing. With no matching assignment, the resolver returns `undefined` so a renderer can use its existing fallback.

`assertCharacterAnimations` validates the JSON shape; `readCharacterAnimations` returns a detached typed property. `mergeCharacterAnimations` merges sparse instance overrides by activity and direction. Omitted slots inherit future prefab edits, while an assigned slot replaces its complete `{ assetId, key, flipX }` value. Native prefab resolution and derived prefab creation apply this merge automatically.

Renderers can call `actor.setAnimationTiming([100, 150, 100])` when selecting authored art. These per-frame delays set the active frame count and first-frame duration, advance idle animations, and govern linked footstep travel. The Phaser adapter does this automatically for directional assignments using ai-assets playback metadata. Saved frame/elapsed values remain intact during `restore`; select the restored activity's timing before ticking. `setAnimationTiming(null)` removes the override; restore uniform `config.frameCount` and `config.frameDurationMs` if needed.

```ts
// Held arrows/joystick: normalized diagonals and collision against the supplied geometry.
actor.setMovementDirection({ x: 1, y: -1 }, [floor]);
actor.tick(deltaMs);
// Release, blur, or modal input ownership; leaves unrelated click walks intact.
actor.setMovementDirection(null, []);
```

Repeated directional updates and turns preserve frame accumulation instead of restarting `walkTo`. Motion reaches the first blocking boundary without stepping through it. Directional snapshots save the current pose as idle, because held input should not resume after loading; click-route and speech snapshots retain their progress. Save `actor.snapshot()`, not the mutable rendering `state`.

Navigation treats the actor as a point and snapshots geometry at the start of a walk. Inset floors or expand obstacles for actor clearance, and cancel/replan if relevant geometry changes during motion. This is intended for room-scale adventure geometry rather than crowds or large navigation meshes.

## Versioned save data

```ts
import { SaveStore, MemorySaveStorage, type GameState } from '@pointlesh/core';

const saves = new SaveStore({
  gameId: 'forest-adventure', version: 1,
  storage: new MemorySaveStorage(),
  validate(state: GameState) {
    if (!['village', 'forest'].includes(state.roomId)) throw new Error('Unknown room');
  },
});
const state: GameState = {
  roomId: 'village', inventory: ['rope'], flags: { metElder: true },
  characters: {}, extensions: { journal: ['Find the king.'], guardClock: 0 },
};
saves.save('first', state);
const candidate = saves.load('first'); // Detached, validated data or null for a missing slot.
```

Use `LocalStorageSaveStorage` in browsers or implement the synchronous `SaveStorage` interface. Its `setItem` must atomically replace one record or preserve the previous record on failure. `save`, `load`, `list` and `remove` report storage failures through `SaveError`. Error codes distinguish `storage`, `corrupt`, `incompatible` and `validation`.

The envelope includes a format version, game version, game ID, timestamp and checksum. A migration keyed `N` upgrades game version `N` to `N+1`. Loading never mutates live actors or scenes. Validate content-specific IDs and all restored subsystems before adopting a candidate. `assertGameState`, `assertCharacterSnapshot` and `assertJSON` are available for integrations. Functions, class instances and non-finite numbers are rejected.

## Dialog, cutscene and behavior integration

`AdventureDialog(dialogManifest, assetManifest, options?)` wraps Dialog Designer's runtime with `start`, `advance`, `choose`, `current`, `onTurn`, `snapshot`, `restore` and `setManifest`. Checkpoints record the dialog ID, commands and their external enablement evaluations. Restore replays recorded checks without calling current predicates or emitting gameplay events, so a choice may hide itself after selection without breaking its saved reply. Future commands use live conditions. Subscribe to `AdventureDialog.onTurn` for game effects. Checkpoints must remain compatible with authored content or be migrated by the client.

`CutsceneRunner({ id, version, steps }, options?)` supports player-advanced and timed steps. `onCompleteStep` applies final step effects; watching and `skip()` use the same callback. `snapshot` stores the step index and elapsed time. `restore` updates presentation without replaying effects. Timed steps require positive `durationMs`; omit it for player advancement. Game-specific visual/audio presentation remains in the client.

`BehaviorRegistry<Context>` maps stable behavior IDs to handlers. `register`, `validate`, `dispatch`, `has`, `ids` and `unregister` provide an explicit extension seam. Dispatch validates every binding before running handlers in declared order. Prefab property values are available on resolved entities; games choose how to pass them through context or `BehaviorBinding.properties`. Executable handlers never enter saved data.

See [runtime semantics](../../docs/runtime.md), [Phaser integration](../phaser/README.md) and the [forest demo](../../demos/forest/src/main.ts) for complete connections between these APIs.
