# pointlesh

[Play The King Under the Mountain](https://tzachshabtay.github.io/pointlesh/) · [Source](https://github.com/tzachshabtay/pointlesh)

A TypeScript toolkit for point-and-click adventure games, built on [AI Assets](https://github.com/tzachshabtay/ai-assets), [Scene Designer](https://github.com/tzachshabtay/scene-designer), and [Dialog Designer](https://github.com/tzachshabtay/dialog-designer).

Pointlesh concentrates on things worth editing visually—navigation polygons, foreground masks, perspective, camera zoom, hotspots and reusable entities—and the common runtime pieces most adventures need: character walking, facing, approaching, speaking, dialogue checkpoints and reliable save data. Game-specific puzzles and presentation remain ordinary TypeScript.

The design was informed by a source-level study of [MonoAGS](https://github.com/tzachshabtay/MonoAGS). The [research and scope report](docs/monoags-research.md) records its feature families, useful character semantics and save-system pitfalls. Pointlesh is an independent implementation, not a source port.

## Packages

The repository follows the same four-package structure as the existing libraries. All four packages produce JavaScript, declarations and source maps; the root and demo workspaces are private.

| Package | Purpose |
| --- | --- |
| [`@pointlesh/core`](packages/core/README.md) | Native scene prefabs, polygon navigation, deterministic characters, behavior dispatch, dialogue/cutscene checkpoints and versioned saves. No Phaser dependency. |
| [`@pointlesh/designer`](packages/designer/README.md) | Engine-independent adventure inspector composed with the native Scene Designer. |
| [`@pointlesh/dev`](packages/dev/README.md) | Local authoring services for all three existing libraries, project JSON persistence and CLI. |
| [`@pointlesh/phaser`](packages/phaser/README.md) | Sprite, camera, walk-behind mask, asset, speech and native designer adapters for Phaser 4. |

## Run the forest adventure

**The King Under the Mountain** is a six-room pixel-art adventure. You play Borin, a dwarf searching for King Aldric after an orc kidnapping. Explore Bramblehollow, its pub and your cottage, the Whispering Wood, Goldroot Mine and the orc camp. Conversation clues, inventory combinations and a recoverable timing puzzle lead to the king's rescue.

Use Node **22.14 or newer**; Vite 7 requires a supported recent Node version.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5186](http://127.0.0.1:5186). The game runs without API keys or authoring servers. Click anywhere to walk to the nearest reachable ground, or hold the arrow keys to walk. Click people or objects to interact. Select one inventory item, then another to combine them. The map, journal, hotspot display and hint button help you explore. Three browser-local save slots preserve progress, including conversations and the exact progress of animated cutscenes. The kidnapping and rescue sequences play automatically, with controls to advance or skip them.

To promote designer edits to project files, run this in a second terminal:

```sh
npm run dev:server
```

The local services use ports **4287** (AI Assets), **4288** (Scene Designer), and **4289** (Dialog Designer). The demo's designer panels target those addresses. Open [the designer directly](http://127.0.0.1:5186/?designer=1) to enter the village editor immediately. Visual editing and JSON export work without these services; promotion and asset generation require the corresponding local service.

Keep the preview web server running while using the designer: Current images and version previews load from its public art files. Opening **Assets** keeps the game playing, including walking, speaking, and camera follow. Scene, prefab, and other world-editing panels suspend play; typing in asset fields does not move the character.

The authoring server loads `demos/forest/.env` and connects AI Assets' OpenAI image and ElevenLabs audio providers. Image generation defaults to GPT Image 2.5 Sunburst; the asset designer also offers GPT Image 2.5 Flare. Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` there, then restart `npm run dev:server`. Existing shell variables take precedence. `OPENAI_IMAGE_MODEL` and `ELEVENLABS_OUTPUT_FORMAT` optionally override provider defaults; an image model selected in the designer takes precedence over the server default. This local `.env` file is ignored by Git and stays outside the public assets; the browser receives no API keys.

The demo loads its committed documents from `demos/forest/public/authoring/`. Promotion writes those JSON files, so edits survive a refresh and are included in the next build. `src/content.ts` defines the initial seed; normal builds never regenerate or overwrite promoted documents. To deliberately reset them, run `node --import tsx demos/forest/scripts/seed-authoring.ts --reset` from the repository root.

In **Assets**, select **Graphics → Characters → Borin**. **Base image** is a single still portrait; choose an **Animation** to preview or edit its frames. Each character has idle, walk and speak sequences with front, back and side artwork. Pickup graphics are under **Graphics → Objects**. In **Adventure**, character prefabs expose directional asset/animation slots, a per-slot **Flip** checkbox and optional diagonal slots. Animation timing comes from AI Assets, including movement linked to frame changes.

Under **Assets → Voices**, select a speaker and use **Line** to switch between the base voice and its dialogue lines. Generate and promote the base voice first, then generate individual lines or use **Regenerate all lines**. The dialogue designer and runtime keep referring to those same line assets.

Areas are native Scene Designer vector shapes. Select an area in **Adventure** and choose **Edit shape** to drag vertices, double-click an edge to add a vertex, press Delete on a selected vertex, or drag an edge to create a quadratic curve. The demo combines walking, character scale and camera zoom on each room’s floor polygon, with a separate curved foreground outline using the same Area prefab.

The [walkthrough](docs/walkthrough.md) contains puzzle solutions and an editor tour. The [art provenance and prompts](docs/art-prompts.md) describe the six generated room backgrounds. Character sprites and ambient music are created locally by the demo; dialogue is text-based unless generated voice assets are supplied.

## Prefabs that remain extensible

Pointlesh creates actual Scene Designer prefabs for areas, hotspots, objects and characters. A single Area has independently enabled walking, character scaling, camera zoom and walk-behind roles; use another instance when boundaries differ. Native attributes handle geometry, transforms and numeric settings. A JSON `pointlesh` extension carries custom properties and behavior IDs.

```ts
import {
  createHotspotPrefab, extendPointleshPrefab, BehaviorRegistry,
} from '@pointlesh/core';

const lockedDoor = extendPointleshPrefab(createHotspotPrefab(), {
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

The current integration uses Scene Designer `^0.2.0`, AI Assets `^0.10.1`, Dialog Designer `^0.1.1` and Phaser `^4.2.0`. Scene Designer 0.2 and Dialog Designer 0.1.1 still declare older AI Assets 0.7 and 0.8 ranges, respectively. This checkout resolves one AI Assets 0.10.1 family and verifies compatibility through the build and tests. Downstream npm applications using these package artifacts need the same application-level overrides until upstream dependency ranges are updated:

```json
{
  "overrides": {
    "@scene-designer/core": { "@ai-game-assets/core": "^0.10.1" },
    "@scene-designer/designer": { "@ai-game-assets/core": "^0.10.1" },
    "@scene-designer/phaser": {
      "@ai-game-assets/core": "^0.10.1",
      "@ai-game-assets/phaser": "^0.10.1"
    },
    "@dialog-designer/core": { "@ai-game-assets/core": "^0.10.1" },
    "@dialog-designer/designer": { "@ai-game-assets/core": "^0.10.1" },
    "@dialog-designer/dev": {
      "@ai-game-assets/core": "^0.10.1",
      "@ai-game-assets/dev": "^0.10.1"
    },
    "@dialog-designer/phaser": {
      "@ai-game-assets/core": "^0.10.1",
      "@ai-game-assets/phaser": "^0.10.1"
    }
  }
}
```

Keep related package versions aligned; do not install duplicate incompatible Scene Designer/AI Assets families into one editor.

## Verification and deployment

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

CI uses Node 22.14 and checks packages, tests, types, the demo build and browser behavior. The Pages workflow builds the forest demo with a relative asset base and deploys `demos/forest/dist` from `main`. Repository Pages must use **GitHub Actions** as its source. Publishing npm packages is a separate release action; no credentials are embedded or configured here.

## Initial scope

Pointlesh is a small toolkit, not an entire game framework. It does not provide a physics engine, crowd navigation, a script language, native platform backends, multiplayer, cloud save synchronization or a generic UI toolkit. Navigation uses point-sized actors and room-scale polygons; route geometry is captured when walking starts, so games must cancel/replan paths after relevant geometry changes.

Save data does not serialize functions, engine objects, promises or a JavaScript call stack. The checksum detects accidental corruption rather than malicious modification. Browser saves belong to that browser/origin. Behavior IDs connect to explicit game dispatch; adding an ID does not execute arbitrary code. Object properties such as custom verbs, inventory rules and entity-specific area restrictions are integration data for clients to implement.

MIT licensed. See [LICENSE](LICENSE).
