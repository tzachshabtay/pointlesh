# Adventure runtime

`@pointlesh/core` contains renderer-independent geometry, characters, saved-game data and behavior dispatch. Scene-designer supplies room/prefab documents. Ai-assets supplies asset definitions. Dialog-designer supplies conversation definitions and execution. The demo shows how to connect these pieces without placing executable code in scene files.

## Coordinates and navigation

World coordinates use pixels, with the origin at the top left and positive Y downward. The character position is its foot/ground anchor. `Polygon` is an array of `{ x, y }` points; use simple, nonzero-area polygons without a repeated closing vertex.

```ts
import { findPath, type Polygon } from '@pointlesh/core';

const floor: Polygon = [
  { x: 0, y: 80 }, { x: 640, y: 80 },
  { x: 640, y: 360 }, { x: 0, y: 360 },
];
const route = findPath({ x: 20, y: 200 }, { x: 600, y: 200 }, [floor]);
// Includes start/end. null means no valid path.
```

`findPath(start, end, walkables, obstacles?)` builds a visibility graph across the union of all walkable polygons and outside the interiors of obstacle polygons. It checks intervals separated by polygon edges, so thin obstacles and concave cutouts cannot be skipped by coarse sampling. Overlapping polygon intersections are graph vertices. Invalid polygons throw; unreachable or outside endpoints return `null`.

Boundary points are allowed, including obstacle edges. The actor footprint is a point: author inset floors or expanded obstacles when physical clearance matters. The algorithm targets room-sized adventure scenes with dozens of polygon vertices; it is not a crowd-navigation system. `pointInPolygon`, `isWalkable`, `isSegmentWalkable`, `closestPointOnPolygon` and `distance` are available for previews and custom tools.

Routes snapshot the geometry used at the start of a walk. If a door closes or an editor changes the walkable geometry during a walk, call `stop()` or request a new route. Outside clicks are rejected by default; a client can explicitly choose a reachable projected target using `closestPointOnPolygon`. There is no fallback that moves straight through walls.

## Characters

```ts
import { CharacterController } from '@pointlesh/core';

const hero = new CharacterController({
  id: 'borin',
  position: { x: 100, y: 240 },
  directions: 4,
  frameCount: 4,
  frameDurationMs: 120,
  walkStep: 6,
  movementLinkedToAnimation: true,
});

// In your frame loop; milliseconds, not seconds:
hero.tick(deltaMs);
// Apply hero.state.position/facing/activity/animationFrame to your renderer.

const arrived = hero.walkTo({ x: 440, y: 250 }, [floor]);
// Keep ticking while awaiting arrived. It resolves true on arrival, false on interruption/failure.
```

In linked mode, a frame boundary moves the actor by `walkStep` world pixels. Choose the distance to match the planted foot's travel in the sprite art; change `frameDurationMs` to alter speed. With `movementLinkedToAnimation: false`, `speed` is pixels/second. A one-frame animation also uses smooth movement. The implementation uses elapsed time, including multiple frame boundaries in one update.

`setScale(scale)` changes rendered perspective scale and, unless `adjustSpeedToScale` is false, adjusts movement proportionally. Facing supports four or eight directions. Logical facing is separate from rendering art; an adapter may mirror or select a fallback animation when an asset has fewer directions.

`walkTo` cancels a previous walk. `stop` cancels pending activity and returns to idle. `place(point, facing?)` changes rooms/checkpoints immediately and cancels pending work. `face(pointOrDirection)` selects a direction. `destination` and `isWalking` support UI/debug views. `snapshot()` makes a detached actor snapshot; `restore(snapshot)` validates before replacing state and resumes saved route/speech progress on future ticks. Restore does not recreate old promises.

### Approach before an interaction

```ts
const approached = hero.approach(
  { position: { x: 450, y: 220 }, walkPoint: { x: 420, y: 250 }, facing: 'up' },
  'walk-if-point',
  [floor],
);
if (await approached) {
  // Recheck puzzle preconditions, then execute the interaction.
}
```

Modes are `none`, `face`, `walk-if-point`, and `walk`. A walk point is the authored standing location, not necessarily the image center. After walking, the actor faces the target or its explicit facing direction. Walking failure/interruption returns false; do not run the interaction in that case. The client owns its verb-to-approach policy and checks mutable puzzle conditions again after arrival.

### Speech and idle

`say(text, durationMs?)` selects speaking activity and interrupts walking. It resolves when the time expires, `finishSpeech()` advances the line, or a new action replaces speech. Text defaults to at least 1.4 seconds and grows with line length. `state.speech` supplies text/remaining time to the UI; the renderer supplies text positioning and optional voice/portraits. An old activity's completion cannot reset a newer activity. Idle is the default standing state and returns to frame zero; custom fidgets can be implemented as a client behavior.

## Saves

```ts
import { SaveStore, LocalStorageSaveStorage, type GameState } from '@pointlesh/core';

const saves = new SaveStore({
  gameId: 'the-stolen-crown',
  version: 1,
  storage: new LocalStorageSaveStorage(),
  validate(state) {
    if (!knownRoomIds.has(state.roomId)) throw new Error('Unknown room');
  },
});

const state: GameState = {
  roomId: 'village', inventory: ['lantern'], selectedItem: 'lantern',
  flags: { metBarkeep: true }, characters: { borin: hero.snapshot() },
  extensions: { 'my-game:weather': { rain: 0.2 } },
};
saves.save('manual', state);
const candidate = saves.load('manual');
if (candidate) {
  // After any additional game checks, adopt the complete candidate.
  hero.restore(candidate.characters.borin!);
}
```

Operations are synchronous and propagate `SaveError` with `corrupt`, `incompatible`, `validation`, or `storage` codes. An absent slot returns `null`; `list()` returns metadata; `remove(slot)` removes one slot. A storage adapter must atomically replace a record or throw while preserving the old record. Browser localStorage has this per-record behavior; `MemorySaveStorage` is useful in tests or nonpersistent clients. The localStorage adapter accesses browser storage lazily, so blocked storage does not prevent game initialization; unavailable storage and quota failures reach the game UI as errors when a storage operation is requested.

The envelope records format version, game ID, game-data version, save time and an FNV-1a checksum for accidental corruption detection. It provides neither encryption nor tamper authentication. Data validation rejects nonfinite numbers, functions, undefined values, circular structures, invalid actor state, duplicate inventory IDs and an unowned selected item. Game-specific validation should additionally check known IDs, dialog shape and current scene compatibility.

Snapshots contain only JSON. They include room, inventory, flags, characters and extension data, plus optional selected item, dialog and cutscene payloads. Character snapshots preserve position, facing, activity, frame timing, scale, remaining path and remaining speech time. Character configuration and asset definitions remain part of the game's versioned content. Dialog state should use the dialog adapter's serializable snapshot. Timers and custom behavior state must be represented in flags/extensions rather than closures.

`load()` never mutates the running game. It parses, checks integrity and identity, performs migrations, validates and returns detached data. Failures leave both the current game and stored record untouched. Migrations keyed by version N receive a detached candidate and return data for N+1:

```ts
const upgradedSaves = new SaveStore({
  gameId: 'the-stolen-crown', version: 2, storage: new LocalStorageSaveStorage(),
  migrations: {
    1: old => ({ ...(old as GameState), extensions: { ...(old as GameState).extensions, chapter: 1 } }),
  },
});
```

Loading a newer version or an older version without the required migration fails explicitly. Migration does not overwrite the old stored record; a subsequent explicit save writes the upgraded version. An application should complete any external asset loads or scene validation before adopting the candidate.

## Client behavior extensions

Prefab files reference behavior IDs and JSON properties. Client code registers the executable behavior:

```ts
import { BehaviorRegistry } from '@pointlesh/core';

const behaviors = new BehaviorRegistry<{ unlock(id: string): void }>();
behaviors.register('my-game:locked-door', {
  validate(properties) {
    if (typeof properties.doorId !== 'string') throw new Error('Missing door ID');
  },
  handle(context, event, properties) {
    if (event.type === 'unlock') context.unlock(properties.doorId as string);
  },
});
await behaviors.dispatch(
  [{ id: 'my-game:locked-door', properties: { doorId: 'camp-gate' } }],
  { type: 'unlock' },
  game,
);
```

Dispatch validates all referenced behaviors before invoking any handler and awaits handlers in declaration order. A handler failure propagates; arbitrary external side effects are not rolled back. Use namespaced IDs and store state in the game's JSON data. `register`, `unregister`, `has` and `ids` support client setup and editor validation. This preserves extensible prefab data without requiring a new scripting language.

## Conversations and cutscenes

`AdventureDialog` wraps dialog-designer's `DialogRuntime` with `start(dialogId)`, `advance()`, `choose(optionId)`, `current()`, `onTurn(listener)`, `snapshot()` and `restore(checkpoint)`. Its checkpoint stores the dialog ID, successful input commands, and the ordered external enablement results for each operation. Restore deterministically replays into a candidate runtime, validates the recorded evaluation order and consumes every check. It emits no wrapper gameplay events and does not call external enablement predicates during historical replay. Loading the reply to an inventory-granting choice therefore neither grants the item twice nor fails because that choice's effect has since hidden the option.

The dialog adapter stores no executable callbacks. Apply game effects through the wrapper or explicit choice handlers, and save those effects in the game state. The optional dialog-designer `isEnabled` selector returns a boolean override or `undefined` to use authored enablement; it should be a pure predicate and cannot issue dialog commands. Future commands after restore use the live selector again. Legacy command-only checkpoints replay against live conditions once and acquire recorded history for their next save. Authored content changes can still require a game-data migration; missing nodes/options or mismatched evaluation histories are rejected without replacing the active conversation.

`CutsceneRunner` handles timed or player-advanced JSON steps and explicit completion effects:

```ts
import { CutsceneRunner } from '@pointlesh/core';

const rescue = new CutsceneRunner({
  id: 'rescue', version: 1,
  steps: [
    { id: 'unlock', speaker: 'Borin', text: 'Stand back!', durationMs: 1800 },
    { id: 'home', text: 'Home again.', payload: { setRoom: 'village' } },
  ],
}, {
  onCompleteStep(step) {
    // Synchronously apply this step's final effects in your game state.
    if (step.id === 'home') game.roomId = 'village';
  },
});
rescue.tick(deltaMs);        // Only durationMs steps auto-advance.
rescue.advance();            // Complete the current step after a click.
rescue.skip();               // Complete every remaining step in order.
const checkpoint = rescue.snapshot();
```

`current()` returns presentation data, or `null` after completion. `completed` reports the final state. `skip()` runs the same completion callback for remaining steps, with `{ skipped: true }` as the second argument. Put essential state changes in that callback so watching and skipping reach the same result. The callback is synchronous; asynchronous movement/voice presentation belongs in the client, which can call `advance()` when it completes.

The checkpoint records cutscene ID, version, current step and elapsed milliseconds. `restore()` validates before replacement and runs no completion effects. Restoring requires the matching definition version; clients can migrate a checkpoint with their save migration. Completion hooks must perform their own effects consistently: a throwing callback leaves the runner on the same step, but the runner cannot roll back arbitrary effects that already happened inside it. A completed runner cannot apply effects again through repeated `advance()` or `skip()` calls.

## Validation coverage

Core tests exercise concave routes, obstacle detours, thin walls, polygon unions, disconnected floors, boundary handling, frame timing, perspective speed, interruption, approach failure, speech ownership, actor restoration, fresh-save round trips, corruption, incompatible versions/games, migrations, storage failure, extension preservation, ordered behavior validation, dialog replay and cutscene skip/restore. Demo integration tests complete every puzzle and restore a combined inventory item, mid-conversation reply, puzzle timer and pending walk into fresh runtimes. Run `npm test` from the repository root.
