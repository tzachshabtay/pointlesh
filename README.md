# pointlesh

[![Play The King Under the Mountain](demos/forest/docs/play-button.svg)](https://tzachshabtay.github.io/pointlesh/demo/)

[Explore the Pointlesh website](https://tzachshabtay.github.io/pointlesh/)

[Demo README](demos/forest/README.md)

A TypeScript toolkit for point-and-click adventure games, built on [AI Assets](https://github.com/tzachshabtay/ai-assets), [Scene Designer](https://github.com/tzachshabtay/scene-designer), and [Dialog Designer](https://github.com/tzachshabtay/dialog-designer).

Pointlesh concentrates on things worth editing visually—navigation polygons, foreground masks, perspective, camera zoom, hotspots and reusable entities—and the common runtime pieces most adventures need: character walking, facing, approaching, speaking, dialogue checkpoints and reliable save data. Game-specific puzzles and presentation remain ordinary TypeScript.

The design was informed by a source-level study of [MonoAGS](https://github.com/tzachshabtay/MonoAGS). The [research and scope report](docs/monoags-research.md) records its feature families, useful character semantics and save-system pitfalls. Pointlesh is an independent implementation, not a source port.

## Packages

The repository follows the same four-package structure as the existing libraries. All four packages produce JavaScript, declarations and source maps; the root and demo workspaces are private.

| Package | Purpose |
| --- | --- |
| [`@pointlesh/core`](packages/core/README.md) | Native scene prefabs, polygon navigation, deterministic characters, behavior dispatch, dialogue/cutscene checkpoints and versioned saves. No Phaser dependency. |
| [`@pointlesh/designer`](packages/designer/README.md) | Engine-independent adventure inspector composed with the native Scene Designer. |
| [`@pointlesh/dev`](packages/dev/README.md) | Local asset, scene, dialog and interaction authoring services, project JSON persistence and CLI. |
| [`@pointlesh/phaser`](packages/phaser/README.md) | Sprite, camera, walk-behind mask, asset, speech and native designer adapters for Phaser 4. |

## Demo

**The King Under the Mountain** is a six-room pixel-art adventure built with Pointlesh. Play as Borin and rescue King Aldric through conversations, inventory puzzles and animated cutscenes.

[▶ Play the game](https://tzachshabtay.github.io/pointlesh/demo/) · [Demo README](demos/forest/README.md)

## Prefabs that remain extensible

Pointlesh uses reusable Scene Designer prefabs for characters, objects and points, and native scene-owned polygons for areas and hotspots. A single area has independently enabled walking, character scaling, camera zoom and walk-behind roles; create another area when boundaries differ. Both models carry custom properties, schemas and behavior IDs in a JSON `pointlesh` extension.

```ts
import {
  createObjectPrefab, extendPointleshPrefab, BehaviorRegistry,
} from '@pointlesh/core';

const lockedDoor = extendPointleshPrefab(createObjectPrefab({ assetId: 'object.door' }), {
  id: 'my-game.locked-door',
  name: 'Locked door',
  properties: { requiredItem: 'brass-key', startsLocked: true },
  propertySchema: {
    requiredItem: { type: 'string', label: 'Required item' },
    startsLocked: { type: 'boolean', label: 'Starts locked' },
  },
  behaviors: ['my-game.unlock'],
});

type Context = { selectedItem?: string; requiredItem: string; unlock(): void };
const behaviors = new BehaviorRegistry<Context>();
behaviors.register('my-game.unlock', {
  handle(context, event) {
    if (event.type === 'interact' && context.selectedItem === context.requiredItem) {
      context.unlock();
    }
  },
});
// Dispatch resolved entity.behaviors with the context appropriate to your game.
```

Derived definitions merge attributes by ID and combine property/schema maps and behavior IDs. Instances inherit omitted fields from their current prefab definition and may override only what differs. Behavior functions stay in source, while stable IDs and JSON properties survive editing and saving. See [prefabs and live editing](docs/prefabs.md) for complete manifest and instance examples.

## Characters and saves

```ts
import { CharacterController, SaveStore, LocalStorageSaveStorage } from '@pointlesh/core';

const borin = new CharacterController({
  id: 'borin', position: { x: 200, y: 300 },
  movementLinkedToAnimation: true,
  walkStep: 7, frameDurationMs: 100, frameCount: 4,
});

// Your renderer calls borin.tick(deltaMs), or a Phaser binding does it for you.
const saves = new SaveStore({
  gameId: 'my-adventure', version: 1, storage: new LocalStorageSaveStorage(),
});
saves.save('slot-1', {
  roomId: 'village', inventory: [], flags: {},
  characters: { borin: borin.snapshot() }, extensions: {},
});
const candidate = saves.load('slot-1');
if (candidate) borin.restore(candidate.characters.borin);
```

Movement supports four/eight-way facing, configurable approach policies, concave walkable polygons, obstacles, interruption, perspective-adjusted speed and movement linked to animation frames. A single-frame walk falls back to smooth movement. Speech and walking have explicit completion and cancellation behavior.

Save files contain validated JSON with game/version identifiers, timestamps and a corruption checksum. Loading validates and migrates a detached candidate before returning it; it never clears the live game. Applications validate their own room/item IDs and adopt the candidate only after all checks pass. Inventory, flags, actor paths, dialogue checkpoints, puzzle timers and namespaced extension data can all be saved. See [runtime semantics and persistence](docs/runtime.md).

## Installation and compatibility

The source checkout uses npm workspaces and a committed lockfile. The package directories are publishable, but this repository does not assume an npm release has already been made. You can build and pack all four packages for local consumption:

```sh
npm run build:packages
npm pack --workspace @pointlesh/core --workspace @pointlesh/designer \
  --workspace @pointlesh/dev --workspace @pointlesh/phaser
```

The current workspace uses Scene Designer `^0.2.2`, AI Assets `^0.11.37`, Dialog Designer `^0.2.2` and Phaser `^4.2.0`. Keep related packages on compatible versions. The root `package.json` records the application-level dependency overrides used by this checkout.

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

CI uses Node 22.14 and checks packages, tests, types, the demo build and browser behavior. See the [demo README](demos/forest/README.md) for its Pages deployment. Publishing npm packages is a separate release action; no credentials are embedded or configured here.

## Initial scope

Pointlesh is a small toolkit, not an entire game framework. It does not provide a physics engine, crowd navigation, a script language, native platform backends, multiplayer, cloud save synchronization or a generic UI toolkit. Navigation uses room-scale polygons; the Phaser navigation adapter expands entity footprints for body clearance and checks live geometry before advancing paths. Games with custom renderers can bind their own live navigation source.

Save data does not serialize functions, engine objects, promises or a JavaScript call stack. The checksum detects accidental corruption rather than malicious modification. Browser saves belong to that browser/origin. Behavior IDs connect to explicit game dispatch; adding an ID does not execute arbitrary code. Object properties such as custom verbs, inventory rules and entity-specific area restrictions are integration data for clients to implement.

MIT licensed. See [LICENSE](LICENSE).
