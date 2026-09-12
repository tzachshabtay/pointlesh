# @pointlesh/phaser

Phaser adapters for Pointlesh actors, room effects, live scene editing, generated assets and dialog. The engine-independent `@pointlesh/core` owns game state and deterministic movement. This package binds that state to Phaser 4 sprites, cameras, masks and scene events.

```sh
npm install @pointlesh/core @pointlesh/designer @pointlesh/phaser phaser \
  @scene-designer/phaser @ai-game-assets/phaser @dialog-designer/phaser
```

## Walking, facing, speaking and perspective

```ts
import { CharacterController, resolvePointleshScene, walkablePolygons } from '@pointlesh/core';
import { PhaserAdventureCharacter } from '@pointlesh/phaser';

let room = resolvePointleshScene(sceneManifest, 'village');
const actor = new CharacterController({
  id: 'dwarf', position: { x: 300, y: 340 },
  movementLinkedToAnimation: true, walkStep: 7,
  frameDurationMs: 100, frameCount: 4,
});
const sprite = scene.add.sprite(300, 340, 'dwarf');
const view = new PhaserAdventureCharacter(scene, actor, sprite, {
  areas: () => room.areas,
  camera: scene.cameras.main,
  frame: state => state.animationFrame, // Or map activity + facing to sheet rows.
  flipLeft: true,
});

await actor.walkTo({ x: 500, y: 370 }, walkablePolygons(room));
actor.face('left');
await actor.say('The king needs us.');
```

The binding ticks on the scene's `update` event by default. If your game manages updates, pass `autoUpdate: false` and call `view.update(deltaMs)` once per frame. That method advances the controller; do not also call `actor.tick()`. Use `view.sync()` after restoring a save or editing a room when time should not advance.

The binding places a sprite at the actor's feet, sets depth to foot Y, applies scale areas, and adjusts walking distance to perspective through the controller. Only pass `camera` for the actor that drives camera zoom. `baseScale` is the original sprite scale; scale areas multiply it. `baseScale`, `origin` and `angle` also accept getters for live prefab transforms. `angle` is in degrees and composes with generated frame rotation. `depthOffset` lets your scene reserve lower depths for background art.

An `areas` getter keeps the same binding valid after the designer changes `room`. Scale and zoom interpolate from the minimum to maximum coordinate of the authored axis (`x` or `y`). One area can supply scale, zoom, walkability and walk-behind roles independently. `scaleAxis` and `zoomAxis` select independent axes. Later enabled areas win per effect when they overlap; a region with zoom disabled does not override another region’s zoom. Disabled or open areas have no effect. Zoom smoothing is independent of frame rate. `evaluatePointleshAreaEffects()` also exposes these calculations for custom renderers and objects.

For directional prefab animations, supply `aiRuntime` and an `animations` getter:

```ts
import { readCharacterAnimations } from '@pointlesh/core';

const view = new PhaserAdventureCharacter(scene, actor, sprite, {
  aiRuntime,
  assetId: 'character.dwarf', // Optional fallback texture when no assignment resolves.
  animations: () => readCharacterAnimations(currentCharacter().properties),
  baseScale: () => ({ x: currentCharacter().scaleX, y: currentCharacter().scaleY }),
  origin: () => ({ x: currentCharacter().anchorX, y: 1 - currentCharacter().anchorY }),
  angle: () => currentCharacter().rotation,
  areas: () => room.areas,
});
```

The getter returns `CharacterAnimations`: `idle`, `walk` and `speak` maps whose front/back/left/right and optional diagonal slots hold `{ assetId, key, flipX? }`. The native ai-assets runtime resolves animation keys and linked animation states, including child assets. Explicit `flipX` is applied independently per slot. Missing diagonals use front/back; missing walking/speaking art uses the matching idle view.

The selected animation supplies its actual frame count, frame rate and optional per-frame delays to the core clock. Idle animates, walking advances planted-foot distance at authored frame boundaries, and timed speech switches back to idle without losing leftover elapsed time. Directional cycles repeat while their activity remains active. No free-running Phaser animation is allowed to drift from movement. Generated frame offsets/scales/rotations compose with the current prefab transform and perspective.

Assignments, linked state changes, frame metadata changes and registered preview replacements update on `sync()` or the next `update()`. Texture bindings follow the resolved animation child, so ai-assets previews/promotions remain live. `refreshAnimation()` explicitly invalidates and synchronizes playback for external authoring integrations. Restoring a saved walk while currently showing idle preserves the saved frame and elapsed time; call `view.sync()` after `actor.restore()`.

Existing clients can still supply `aiRuntime`, `assetId` and `animation: state => ...`, or the simpler `frame` callback for custom sheets. These callbacks retain the configured clock when no directional assignment resolves. With legacy animation callbacks, keep the controller's frame count/duration aligned with the authored cycle yourself. A resolved directional assignment takes precedence over both callbacks.

Destroying the scene or sprite detaches the binding and generated texture/animation bindings. Calling `view.destroy()` detaches it without destroying your sprite or controller.

## Scrolling rooms

```ts
import { PhaserRoomCamera } from '@pointlesh/phaser';

const roomCamera = new PhaserRoomCamera(scene.cameras.main, {
  room: { width: 1620, height: 540 },
  target: () => actor.state.position,
  smoothing: 8,
});
// In your update, after view.update(deltaMs) has applied the player's area zoom:
roomCamera.update(deltaMs);
// After changing rooms or restoring the actor:
roomCamera.setRoom(nextRoom);
roomCamera.snap();
```

The helper follows horizontally with frame-independent smoothing and clamps the visible view to the room at the current zoom. It controls scroll on an unrotated camera; it leaves zoom and Phaser's native follow/bounds settings to the caller. Do not also call `camera.startFollow()`. Rooms no wider than the unzoomed viewport keep their original horizontal framing, including fractional area zoom. Vertical scrolling is available with `axes: 'vertical'` or `'both'`; axes that do not scroll return to the room origin. `smoothing: 0` follows immediately.

Use `roomCamera.setEnabled(false)` while an editor controls the camera. The character binding's `camera` option also accepts a getter, such as `camera: () => designerOpen ? undefined : scene.cameras.main`, to suspend area zoom during editor pan/zoom and live property edits. When editing ends, call `view.sync()` and `roomCamera.snap()` to return to the player. `snap()` is an explicit reframe and works while following is disabled. The helper registers no event listeners.

The forest demo uses a dedicated 1620×540 room image, with the other rooms remaining 960×540. Its native Scene Designer minimap can pan anywhere in the authored room, zoom, or fit the whole scene; gameplay follow pauses while it is open. Returning from the mine or camp places Borin at that room's forest entrance. Saving and loading restores his world position and reframes the camera.

## Sprite interactions

```ts
import { bindAdventureSpriteInteraction } from '@pointlesh/phaser';

const interaction = bindAdventureSpriteInteraction(npcSprite, {
  enabled: () => !designerOpen && !dialogOpen,
  onHover: hovering => showName(hovering ? npc.name : ''),
  onInteract: () => approachAndTalk(npc.id),
});
```

This uses native Phaser pointer input and samples the current texture frame's alpha, so transparent pixels pass through. Moving, scaling, rotating, changing frames, and flipping the sprite update the clickable shape automatically. Successful sprite interactions stop propagation to scene handlers, preventing the same click from also starting a background walk. `alphaTolerance` defaults to 1. Destroying the sprite or scene removes the binding; `interaction.destroy()` detaches it manually and restores prior input settings.

The forest demo stores each interactive character or object's story `targetId` and relative `approachOffsetX`/`approachOffsetY` in its prefab. The same entity resolves sprite clicks and Nearby actions, and the standing point follows its authored position. Characters and rendered pickups—including the rope, coin and mushroom—have no duplicate hotspot areas. Turning off an entity's `interactive` property disables its sprite and Nearby action; collected pickups disappear and stop receiving input. The king also forwards clicks to the cage puzzle, whose environmental area remains independently interactive. The library helper accepts arbitrary callbacks, so client games can define their own object behaviors without adopting the demo's story metadata.

## Walk-behind scenery

```ts
import { createWalkBehindOverlay } from '@pointlesh/phaser';

const tree = room.areas.find(area => area.id === 'old-oak')!;
const duplicateBackground = scene.add.image(0, 0, 'village').setOrigin(0, 0);
const foreground = createWalkBehindOverlay(scene, tree, duplicateBackground);
// After a live shape or baseline edit:
foreground.sync(room.areas.find(area => area.id === 'old-oak')!);
```

The overlay masks a duplicate background to the authored polygon and draws it at the area's baseline. It uses Phaser 4's mask filter in WebGL and a geometry mask in Canvas. The WebGL filter renders in the current camera's coordinate system, including its origin and transform order, so the foreground and background sample identical pixels during fractional zoom and scrolling. Actors with smaller foot Y appear behind the masked scenery, and actors with larger foot Y appear in front. Use identical transforms on the base and duplicate backgrounds. Use the same `depthOffset` on actors and overlays. `sync()` respects the area's independent walk-behind switch. `destroy()` removes the mask, its graphics and the supplied image; pass `destroyImage: false` to retain the image and restore its filter focus settings. Scene shutdown cleans up automatically.

Games choose their filtering with `installPhaserTextureScaling` in `create()`:

```ts
installPhaserTextureScaling(scene, {
  default: "nearest",
  canvas: "pixelated",
  resolve: texture => texture.key.startsWith("room.") ? "smooth-pixel-art" : undefined,
});
```

`nearest` preserves source colors and hard pixel edges; `linear` blends adjacent texels and suits painted/high-resolution art. `smooth-pixel-art` preserves texel interiors while smoothing boundaries during fractional zoom. The setting covers existing textures and future loads, including AI previews, promoted images, animation sheets, objects, and cutscenes. Texture settings are shared by every sprite/scene using that texture. `setTextureScaling(texture, mode)` also supports individual changes. The installation removes its load listener on scene shutdown or `destroy()`; texture choices remain applied.

Browser canvas scaling is independent: choose `canvas: "pixelated"` (pixel-art appearance), `"crisp-edges"` (avoid blending), or `"auto"` (browser smoothing). Omit it to keep the game's CSS. Nearest sampling cannot remove blur already present in source art; noninteger scaling can produce uneven pixel widths. Integer display scaling is the strictest pixel-perfect option, but is a different choice from this demo's continuous perspective zoom.

The forest demo uses nearest sampling for sprites and smooth pixel-art sampling for room textures. Keep `antialias: true`, `antialiasGL: false`, and `roundPixels: false` for its continuous camera zoom and aligned walk-behind overlays. Avoid the global `smoothPixelArt` flag for masked duplicate backgrounds: it also forces multisampled canvas edges, while Phaser's filter framebuffers are not multisampled, which can make the room's outer edge composite differently.

References: [Phaser texture filters](https://docs.phaser.io/api-documentation/4.0.0/namespace/textures-filtermode), [Phaser 4 rendering](https://phaser.io/tutorials/phaser-4-rendering-concepts), and [MDN canvas image rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-rendering).

## Native scene designer plus adventure inspector

```ts
import { installPhaserPointleshDesigner } from '@pointlesh/phaser';

const editor = installPhaserPointleshDesigner({
  scene, manifest: sceneManifest, aiAssets: assetManifest,
  defaultSceneId: 'village',
  renderSceneObjects: false, // The game already owns its actor sprites.
  onManifestChange(manifest) { sceneManifest = manifest; },
  onPreview(resolved) { room = resolved; view.sync(); },
});
editor.designer.open();
editor.inspector.open();
```

This reuses scene-designer's native canvas handles, curved polygons, prefab editing and minimap. The adventure inspector adds Pointlesh properties, custom JSON properties, behavior IDs, undo/redo and manifest export. Selecting an area instance or definition in the native Scenes or Prefabs panel also shows its **Area capabilities**, including the **Walk-behind** switch, without opening another panel.


When walk-behind is enabled, a labeled horizontal baseline appears across the scene. Drag the line or its label vertically to change occlusion immediately; one **Undo area edit** restores the starting value. The number field, exported manifest, and runtime share the same baseline. Disabling walk-behind hides the line and turns off the effect.

The adapter renders area shapes, selection boxes, vertices and baselines in a transparent HTML canvas above game UI and below floating designer panels. Game controls stay visible; transparent pixels pass through clicks, while painted editor pixels retain editing priority. This layer shares the game camera and runs no simulation. Installing or opening the editor never pauses the game. The host can reserve canvas gestures and camera navigation for editing while continuing character animations and other simulation.

Vertices outside the visible canvas or behind designer panels use the same small vertex handles as Scene Designer, capped to the nearest available edge. Selecting or clicking a handle leaves the shape intact; dragging brings that vertex to the visible handle position. Native curves and vertex IDs are preserved, and the native designer's undo restores the whole drag. Handles account for camera transforms, page scrolling, resizing, and adjacent handles.

Pointlesh's inspector uses Scene Designer's standard palette and theme variables. Designer controls are styled by the library independently of the demo game's UI.

`installPhaserPointleshDesigner` installs both helpers and exposes them as `areaBaseline` and `areaEdgeHandles`. Standalone integrations can use `installPhaserAreaBaseline({ scene, designer, inspector })` and `installPhaserAreaEdgeHandles({ scene, designer })`; both accept an optional camera getter and return `sync()` and `destroy()`. Native selection and manifest changes keep the controls synchronized. Scene shutdown or `editor.destroy()` cleans up the panels, drawings, and input handlers.

## ai-assets and dialog-designer

`loadPointleshAssets(scene, manifest, { assetIds?, baseUrl?, targetId? })` queues textures through ai-assets in `preload()`. `createPointleshAssetRuntime(scene, manifest, options)` creates the runtime and authored animations in `create()`. The runtime's `bindTexture` support preserves designer previews and promotions. Native `AiAssetRuntime`, loaders, animation creation and `installAiAssetDesigner` are also exported.

`PhaserAdventureDialog` connects an `AdventureDialog` to actors using dialog voice asset IDs, and plays generated voice audio when it has been loaded:

```ts
import { PhaserAdventureDialog, loadDialogAudioAssets } from '@pointlesh/phaser';

// preload(): loadDialogAudioAssets(scene, dialogManifest, assetManifest)
const speech = new PhaserAdventureDialog(scene, adventureDialog, {
  speakers: { 'voice.innkeeper': innkeeper, 'voice.dwarf': actor },
  aiAssets: assetManifest,
});
adventureDialog.start('pub-rumors');
// Your UI renders turns and calls advance()/choose().
// After adventureDialog.restore(savedDialog):
speech.sync();
```

Speech remains active until the conversation advances by default. Set `waitForAdvance: false` or provide `durationMs(turn)` for timed text. A `speaker(turn)` callback supports custom casting. The bridge does not advance conversations or implement puzzle effects; use the core dialog wrapper's `onTurn` events. Scene shutdown detaches listeners and stops audio. Native `PhaserDialogRuntime`, `installPhaserDialogDesigner` and `loadDialogAudioAssets` are re-exported.
