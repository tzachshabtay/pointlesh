# @pointlesh/core

Renderer-independent point-and-click adventure building blocks for TypeScript. This package uses the native AI Assets, Scene Designer and Dialog Designer data models and has no Phaser or DOM runtime dependency.

The root [installation notes](../../README.md#installation-and-compatibility) describe the current peer versions and required npm overrides when consuming the package artifacts.

## Native adventure prefabs

`pointleshPrefabs()` supplies walkable, walk-behind, scale, zoom, hotspot, object and character prefab definitions. Individual `create*Prefab` factories accept geometry, properties, behavior IDs, schemas and extra native attributes. Register the definitions in a Scene Designer schema-version-2 manifest; `createPointleshInstance()` produces normal prefab instances with optional adventure overrides.

`resolvePointleshScene(manifest, sceneId)` resolves native defaults/overrides and returns `entities`, polygon `areas` and sprite `objects`. `walkablePolygons(scene)` extracts enabled, closed walkable shapes. Native curves are sampled for runtime geometry. World coordinates have positive Y downward; object/actor positions are ground anchors.

Use `extendPointleshPrefab(base, extension)` for reusable specializations. It produces a new definition rather than a live inheritance chain between definitions. Instances still inherit omitted native fields from their selected prefab. Custom JSON properties and behavior IDs stay editable and serializable. See the [prefab guide](../../docs/prefabs.md).

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

`CharacterController` exposes `state`, `tick`, `walkTo`, `setMovementDirection`, `approach`, `face`, `place`, `say`, `finishSpeech`, `stop`, `snapshot` and `restore`. `walkTo` snaps clicks by default; its `destination` getter reports the resolved target. Pass `{ snap: false }` as the fourth argument for an exact walk. Approach modes are `none`, `face`, `walk-if-point` and `walk`; approach always uses exact navigation and returns false when the standing point is unreachable or movement is interrupted. A new walk or speech replaces the previous action. Facing is independent of available art; renderers choose directional frames.

With movement linked to animation, each frame change permits a configured `walkStep` distance. Single-frame walks use continuous speed. Perspective scale can adjust travel distance. Idle, walking and speaking use a deterministic elapsed-millisecond state; the renderer must tick each actor exactly once.

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
