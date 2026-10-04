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
| [`@pointlesh/dev`](packages/dev/README.md) | Local asset, scene, dialog and interaction authoring services, project JSON persistence and CLI. |
| [`@pointlesh/phaser`](packages/phaser/README.md) | Sprite, camera, walk-behind mask, asset, speech and native designer adapters for Phaser 4. |

## Run the forest adventure

**The King Under the Mountain** is a six-room pixel-art adventure. You play Borin, a dwarf searching for King Aldric after an orc kidnapping. Explore Bramblehollow, its pub and your cottage, the Whispering Wood, Goldroot Mine and the orc camp. Conversation clues, inventory combinations and a recoverable timing puzzle lead to the king's rescue.

Use Node **22.14 or newer**; Vite 7 requires a supported recent Node version.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5186](http://127.0.0.1:5186). Choose **New game** to start fresh with the animated kidnapping, or **Load** to choose a saved slot. Startup never automatically loads or saves progress; **Menu** returns to the title screen. The game runs without API keys or authoring servers. Click anywhere to walk to the nearest reachable ground, or hold the arrow keys to walk. Click people or objects to interact. Select one inventory item, then another to combine them. The map, journal, hotspot display and hint button help you explore. Three browser-local save slots preserve progress, including conversations and the exact progress of animated cutscenes. The kidnapping and rescue sequences play automatically, with controls to advance or skip them.

To promote designer edits to project files, run this in a second terminal:

```sh
npm run dev:server
```

The local services use ports **4287** (AI Assets), **4288** (Scene Designer), **4289** (Dialog Designer), and **4290** (Interactions). The demo's designer panels target those addresses. Start or load a game, then click **Designer** to edit the scene. The older `?designer=1` URL also opens the title screen and no longer skips the intro. Visual editing and JSON export work without these services; promotion and asset generation require the corresponding local service.

Keep the preview web server running while using the designer: Current images and version previews load from its public art files. Opening **Assets** keeps the game playing, including walking, speaking, and camera follow. Scene and prefab panels reserve canvas gestures and camera navigation for editing while animations and simulation keep running. Designer drawings appear above game UI without hiding it; typing in designer fields does not move the character.

The authoring preview stays on the current game session when the computer sleeps, a development connection drops, or files are promoted. Source-code changes require an explicit browser refresh; designer edits still apply live through their normal callbacks. This prevents a development-server reconnect from silently returning to the title screen.

AI Assets backs up the latest generated choices and pending selections per asset in browser IndexedDB. Return to the same asset after a refresh to recover them, including their animation geometry. These backups do not promote assets or save/load game progress. Promoted images remain project files; unfinished generations and failed browser backups warn before leaving the page.

Drag a panel title or any designer toolbar button to move the tools. Resize panels from their edges or corners; the bottom border has a small grip and remains draggable after scrolling the panel contents. Switching tabs preserves each panel's chosen size.

The authoring server loads `demos/forest/.env` and connects AI Assets' OpenAI image and ElevenLabs audio providers. Image generation defaults to GPT Image 2.5 Sunburst; the asset designer also offers GPT Image 2.5 Flare. Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` there, then restart `npm run dev:server`. Existing shell variables take precedence. `OPENAI_IMAGE_MODEL` and `ELEVENLABS_OUTPUT_FORMAT` optionally override provider defaults; an image model selected in the designer takes precedence over the server default. This local `.env` file is ignored by Git and stays outside the public assets; the browser receives no API keys.

The demo loads its committed documents from `demos/forest/public/authoring/`. Promotion writes those JSON files, so edits survive a refresh and are included in the next build. `src/content.ts` defines the initial seed; normal builds never regenerate or overwrite promoted documents. To deliberately reset them, run `node --import tsx demos/forest/scripts/seed-authoring.ts --reset` from the repository root.

In **Assets**, select **Graphics → Characters → Borin**. **Base image** is a single still portrait; choose an **Animation** to preview or edit its frames. Each character has idle, walk and speak sequences with front, back and side artwork. When an animation is selected as a generation reference, AI Assets uses one complete frame with its original margins to guide appearance and size; it does not send the whole sheet as a single pose. Pickup graphics are under **Graphics → Objects**. In **Prefabs → Directional animations**, character prefabs expose directional asset/animation slots, a per-slot **Flip** checkbox and optional diagonal slots. Animation timing comes from AI Assets, including movement linked to frame changes.

Grub patrols between the cage and cauldron: front idle, one back-idle cycle, walk left, drink, then walk right and return to front idle. Direction changes are immediate. His linked animation clips are editable in Assets, and the two named **Grub** points in the camp control his route. The puzzle follows his visible actions; the sleeping brew takes effect when he finishes drinking. Saving preserves his current patrol phase and position.

Dialogs show an animated close-up face above the speech card. **Assets → Graphics → Portraits** contains each character's still portrait and linked **Close-up speak** loop. **Prefabs → Dialog portrait** selects the portrait and speaking animation; scene instances can override or reset those selections. Reply choices show Borin's still portrait. Games own their dialog layout and speaker mapping; Pointlesh supplies the prefab properties and HTML asset playback.

Speaking cutscene characters also show their portrait at the top left. Door movement overlaps the safe approach and departure walk, and the rescue cutscene inherits Borin's live position and camera. The ending offers **Play again**, which clears the story and restarts the intro. The mine chest has four joke answers both before and after learning its password; the correct answer becomes available after Orrin's clue. Dreamcap stout bubbles purple in the satchel and selected cursor, and Borin plays **Pour brew · back** before consuming it at the cauldron. These sequences and puzzle rules belong to the demo.

**Scaled variants...** in the Current panel manages alternate resolutions of an image or animation. Enter width and height (per frame for animations), then generate three candidates, animate them if applicable, and select one to Promote or Save and close. Edit a saved size to regenerate it, use Touch up, or delete it. OpenAI upscaling uses the existing `OPENAI_API_KEY`; strict nearest-neighbor and smooth resizing need no API. Animation upscaling sends the whole sheet and shares normal generation's row/column alignment, respecting the asset's alignment setting. The runtime selects the closest available resolution for the displayed physical size, including zoom, while retaining authored object sizes and timing. The demo renders at display resolution to avoid a second pixelated scaling pass, and room backgrounds and walk-behind overlays switch together.

The **Interactions** tab shows every character, object, hotspot and inventory item against the game’s verbs and inventory items. Click a cell to assign game code (★), hero speech (green ✓), or an unavailable combination (red ✕); clear it to leave it unassigned. Speech edits create native voice lines under Borin’s voice automatically. Changes preview immediately, persist as local drafts, and are written to the project with **Promote**. Search and target-type filters help navigate the matrix.

Under **Assets → Voices**, select a speaker and use **Line** to switch between the base voice and its dialogue lines. Generate and promote the base voice first, then generate individual lines or use **Regenerate all lines**. The dialogue designer and runtime keep referring to those same line assets.

Areas are native Scene Designer vector shapes. Select an area in **Scenes** and choose **Edit shape** to drag vertices, double-click an edge to add a vertex, press Delete on a selected vertex, or drag an edge to create a quadratic curve. The demo combines walking, character scale and camera zoom on each room’s floor polygon, with a separate curved foreground area. Each expanded scene layer has **Areas** and **Hotspots** lists and **Add area** / **Add hotspot** controls. These polygons belong to that scene and stay out of the prefab browser.

Named **Point** prefabs store X/Y coordinates and show draggable markers in the designer. Select a point, choose a character, then **Move character here** or **Walk character here** to try it. Hotspots and objects have an optional **Walk point** dropdown; interactions wait for the character to arrive. The demo uses distinct room-entry points for each connecting room, including the forest's village, mine and camp entrances. Create points under **Prefabs → Points**, then place instances in Scenes.

Characters and objects are solid by default. Select one in Scenes or Prefabs and use **Navigation → WalkThrough** to let other characters pass through it. Click walks detour around occupied ground; arrow movement stops at it. Footprints follow moving entities and live edits, and disappear when an entity is hidden or collected.

The [walkthrough](docs/walkthrough.md) contains puzzle solutions and an editor tour. The [art provenance and prompts](docs/art-prompts.md) describe the six generated room backgrounds. Character sprites and ambient music are created locally by the demo; dialogue is text-based unless generated voice assets are supplied.

Each named character has a dedicated prefab: Borin, Elder Rowan, Mara, Orrin, Grub and King Aldric. The coin, rope and mushroom also have their own object prefabs. Edit reusable artwork, animations, movement and behavior defaults in **Prefabs**, then edit room placement and overrides in **Scenes**. Select an instance and use **Edit prefab** to jump to its definition. Property controls show inheritance and provide **Reset to prefab**; animation slots use **Use prefab**. **Movement**, **Properties** and **Custom properties & behaviors** expand in the same inspector. Undo/redo and JSON export are available there; there is no separate Adventure tab.

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

The current integration uses Scene Designer `^0.2.2`, AI Assets `^0.11.17`, Dialog Designer `^0.1.1` and Phaser `^4.2.0`. Scene Designer 0.2 and Dialog Designer 0.1.1 still declare older AI Assets 0.7 and 0.8 ranges, respectively. This checkout resolves one AI Assets 0.11.17 family and verifies compatibility through the build and tests. Downstream npm applications using these package artifacts need the same application-level overrides until upstream dependency ranges are updated:

```json
{
  "overrides": {
    "@scene-designer/core": { "@ai-game-assets/core": "^0.11.17" },
    "@scene-designer/designer": { "@ai-game-assets/core": "^0.11.17" },
    "@scene-designer/phaser": {
      "@ai-game-assets/core": "^0.11.17",
      "@ai-game-assets/phaser": "^0.11.17"
    },
    "@dialog-designer/core": { "@ai-game-assets/core": "^0.11.17" },
    "@dialog-designer/designer": { "@ai-game-assets/core": "^0.11.17" },
    "@dialog-designer/dev": {
      "@ai-game-assets/core": "^0.11.17",
      "@ai-game-assets/dev": "^0.11.17"
    },
    "@dialog-designer/phaser": {
      "@ai-game-assets/core": "^0.11.17",
      "@ai-game-assets/phaser": "^0.11.17"
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

Pointlesh is a small toolkit, not an entire game framework. It does not provide a physics engine, crowd navigation, a script language, native platform backends, multiplayer, cloud save synchronization or a generic UI toolkit. Navigation uses room-scale polygons; the Phaser navigation adapter expands entity footprints for body clearance and checks live geometry before advancing paths. Games with custom renderers can bind their own live navigation source.

Save data does not serialize functions, engine objects, promises or a JavaScript call stack. The checksum detects accidental corruption rather than malicious modification. Browser saves belong to that browser/origin. Behavior IDs connect to explicit game dispatch; adding an ID does not execute arbitrary code. Object properties such as custom verbs, inventory rules and entity-specific area restrictions are integration data for clients to implement.

MIT licensed. See [LICENSE](LICENSE).
