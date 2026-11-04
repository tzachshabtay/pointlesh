# The King Under the Mountain

[![Play The King Under the Mountain](docs/play-button.svg)](https://tzachshabtay.github.io/pointlesh/demo/)

**The King Under the Mountain** is a six-room pixel-art adventure. You play Borin, a dwarf searching for King Aldric after an orc kidnapping. Explore Bramblehollow, its pub and your cottage, the Whispering Wood, Goldroot Mine and the orc camp. Conversation clues, inventory combinations and a recoverable timing puzzle lead to the king's rescue.

## Run locally

Use Node **22.14 or newer**; Vite 7 requires a supported recent Node version.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5186](http://127.0.0.1:5186). Choose **New game** to start fresh with the animated kidnapping, or **Load** to choose a saved slot. Startup never automatically loads or saves progress; **Menu** returns to the title screen. The game runs without API keys or authoring servers. Click anywhere to walk to the nearest reachable ground, or hold the arrow keys to walk. Click people or objects to interact. Select one inventory item, then another to combine them. The map, journal, hotspot display and hint button help you explore. Three browser-local save slots preserve progress, including conversations and the exact progress of animated cutscenes. The kidnapping and rescue sequences play automatically, with controls to advance or skip them.

## Authoring and promotion

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

The public game is read-only: it does not install the designer or contain API keys. Generation and promotion use the local authoring services; only a Git push and successful Pages deployment change the game for other players.

## Explore the demo

In **Assets**, select **Graphics → Characters → Borin**. **Base image** is a single still portrait; choose an **Animation** to preview or edit its frames. Each character has idle, walk and speak sequences with front, back and side artwork. When an animation is selected as a generation reference, AI Assets uses one complete frame with its original margins to guide appearance and size; it does not send the whole sheet as a single pose. Pickup graphics are under **Graphics → Objects**. In **Prefabs → Directional animations**, character prefabs expose directional asset/animation slots, a per-slot **Flip** checkbox and optional diagonal slots. Animation timing comes from AI Assets, including movement linked to frame changes.

Grub patrols between the cage and cauldron: front idle, one back-idle cycle, walk left, drink, then walk right and return to front idle. Direction changes are immediate. His linked animation clips are editable in Assets, and the two named **Grub** points in the camp control his route. The puzzle follows his visible actions; the sleeping brew takes effect when he finishes drinking. Saving preserves his current patrol phase and position.

Dialogs show an animated close-up face above the speech card. **Assets → Graphics → Portraits** contains each character's still portrait and linked **Close-up speak** loop. **Prefabs → Dialog portrait** selects the portrait and speaking animation; scene instances can override or reset those selections. Reply choices show Borin's still portrait. Games own their dialog layout and speaker mapping; Pointlesh supplies the prefab properties and HTML asset playback.

Speaking cutscene characters also show their portrait at the top left. Door movement overlaps the safe approach and departure walk, and the rescue cutscene inherits Borin's live position and camera. The ending offers **Play again**, which clears the story and restarts the intro. The mine chest has four joke answers both before and after learning its password; the correct answer becomes available after Orrin's clue. Dreamcap stout bubbles purple in the satchel and selected cursor, and Borin plays **Pour brew · back** before consuming it at the cauldron. These sequences and puzzle rules belong to the demo.

[AI Assets](https://github.com/tzachshabtay/ai-assets) owns the **Scaled variants…** editor and generation workflow. Pointlesh selects the closest saved variant at display time, including camera zoom, while preserving the game’s authored object sizes and animation timing.

The **Interactions** tab shows every character, object, hotspot and inventory item against the game’s verbs and inventory items. Click a cell to assign game code (★), hero speech (green ✓), or an unavailable combination (red ✕); clear it to leave it unassigned. Speech edits create native voice lines under Borin’s voice automatically. Changes preview immediately, persist as local drafts, and are written to the project with **Promote**. Search and target-type filters help navigate the matrix.

The top **Defaults** row supplies a column's fallback when a target cell is empty. Simple speech can contain several sentences: **Random** picks one, **Rotation** cycles and wraps, and **Sequence** says each in order through Continue. Each sentence syncs to its own voice line; saved games retain rotation positions and pending sequence sentences.

Under **Assets → Voices**, select a speaker and use **Line** to switch between the base voice and its dialogue lines. Generate and promote the base voice first, then generate individual lines or use **Regenerate all lines**. The dialogue designer and runtime keep referring to those same line assets.

Areas are native Scene Designer vector shapes. Select an area in **Scenes** and choose **Edit shape** to drag vertices, double-click an edge to add a vertex, press Delete on a selected vertex, or drag an edge to create a quadratic curve. The demo combines walking, character scale and camera zoom on each room’s floor polygon, with a separate curved foreground area. Each expanded scene layer has **Areas** and **Hotspots** lists and **Add area** / **Add hotspot** controls. These polygons belong to that scene and stay out of the prefab browser.

Named **Point** prefabs store X/Y coordinates and show draggable markers in the designer. Select a point, choose a character, then **Move character here** or **Walk character here** to try it. Hotspots and objects have an optional **Walk point** dropdown; interactions wait for the character to arrive. The demo uses distinct room-entry points for each connecting room, including the forest's village, mine and camp entrances. Create points under **Prefabs → Points**, then place instances in Scenes.

Characters and objects are solid by default. Select one in Scenes or Prefabs and use **Navigation → WalkThrough** to let other characters pass through it. Click walks detour around occupied ground; arrow movement stops at it. Footprints follow moving entities and live edits, and disappear when an entity is hidden or collected.

Each named character has a dedicated prefab: Borin, Elder Rowan, Mara, Orrin, Grub and King Aldric. The coin, rope and mushroom also have their own object prefabs. Edit reusable artwork, animations, movement and behavior defaults in **Prefabs**, then edit room placement and overrides in **Scenes**. Select an instance and use **Edit prefab** to jump to its definition. Property controls show inheritance and provide **Reset to prefab**; animation slots use **Use prefab**. **Movement**, **Properties** and **Custom properties & behaviors** expand in the same inspector. Undo/redo and JSON export are available there; there is no separate Adventure tab.

## Game implementation

The forest uses separate named entry points for arrivals from Bramblehollow, the mine and the camp. Exit hotspots share their doorway walk points; pickups and scenery have separate interaction points. The one-time point migration can be rerun with `node --import tsx demos/forest/scripts/add-points.ts` from the repository root without resetting existing edits.

Borin, Rowan, Mara, Orrin, Grub, Aldric and the key pickup objects have named prefabs. Room placement and facing are instance data; the floor, foreground and exit polygons belong to their scenes. The `demos/forest/scripts/specialize-entity-prefabs.ts` migration preserves resolved room data without regenerating assets.

The demo supplies separate **Graphics → Cursors** and **Graphics → Inventory** assets with native click animations. `npx tsx demos/forest/scripts/generate-interface-art.ts --promote` reproduces the original PNGs while preserving selected authored versions.

## More documentation

[Walkthrough and designer tour](docs/walkthrough.md) · [Art provenance and prompts](docs/art-prompts.md) · [Animation sound cues](docs/audio-frame-tags.md)

Door-art production notes: [follow-up](docs/doorway-art-followup.md), [palette correction](docs/door-palette-correction.md), and [fully opening cottage doors](docs/cottage-door-opening.md).

The Pages workflow builds this demo with a relative asset base and publishes it at `/pointlesh/demo/`, alongside the Pointlesh website at `/pointlesh/`. Repository Pages must use **GitHub Actions** as its source.
