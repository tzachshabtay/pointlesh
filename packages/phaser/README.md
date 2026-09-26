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
  assetId: 'character.dwarf', // Base image defines logical size and fallback texture.
  animations: () => readCharacterAnimations(currentCharacter().properties),
  baseScale: () => ({ x: currentCharacter().scaleX, y: currentCharacter().scaleY }),
  origin: () => ({ x: currentCharacter().anchorX, y: 1 - currentCharacter().anchorY }),
  angle: () => currentCharacter().rotation,
  areas: () => room.areas,
});
```

The getter returns `CharacterAnimations`: `idle`, `walk` and `speak` maps whose front/back/left/right and optional diagonal slots hold `{ assetId, key, flipX? }`. The native ai-assets runtime resolves animation keys and linked animation states, including child assets. Explicit `flipX` is applied independently per slot. Missing diagonals use front/back; missing walking/speaking art uses the matching idle view.

The selected animation supplies its actual frame count, frame rate and optional per-frame delays to the core clock. Idle animates, walking advances planted-foot distance at authored frame boundaries, and timed speech switches back to idle without losing leftover elapsed time. Directional cycles repeat while their activity remains active. No free-running Phaser animation is allowed to drift from movement. Generated frame offsets/scales/rotations compose with the current prefab transform and perspective.

Animation resolution does not define character size. With `assetId`, every linked clip is fitted to the base asset's frame dimensions before applying `baseScale`, perspective, and authored frame transforms. A 48×64 idle clip and a 24×32 speaking clip therefore occupy the same logical bounds; promoting either clip cannot double or halve the actor. Base image dimension edits remain live and match Scene Designer's bounds. Pass `baseSize: { width: 48, height: 64 }` (or a getter) to choose logical dimensions independently of image resolution, including when assigning clips without a base asset. Frame padding and authored frame scales still affect the visible silhouette.

Assignments, linked state changes, frame metadata changes and registered preview replacements update on `sync()` or the next `update()`. Texture bindings follow the resolved animation child, so ai-assets previews/promotions remain live. `refreshAnimation()` explicitly invalidates and synchronizes playback for external authoring integrations. Restoring a saved walk while currently showing idle preserves the saved frame and elapsed time; call `view.sync()` after `actor.restore()`.

For cutscenes and animation previews, `view.renderPose({ position, activity, facing, scale? }, elapsedMs)` samples a looping clip at absolute time using the same assignments, frame holds, transforms, previews, and scaled variants. It leaves the gameplay controller and its movement path untouched. Use a separate sprite/binding with `autoUpdate: false` for a cinematic cast, and supply the cutscene checkpoint's elapsed time to restore the exact pose. Call `sync()` or `update()` to resume displaying the controller.

Existing clients can still supply `aiRuntime`, `assetId` and `animation: state => ...`, or the simpler `frame` callback for custom sheets. These callbacks retain the configured clock when no directional assignment resolves. With legacy animation callbacks, keep the controller's frame count/duration aligned with the authored cycle yourself. A resolved directional assignment takes precedence over both callbacks.

Destroying the scene or sprite detaches the binding and generated texture/animation bindings. Calling `view.destroy()` detaches it without destroying your sprite or controller.

## Solid characters and objects

Character and object prefabs expose **WalkThrough**, stored as `properties.walkThrough`, with a default of `false` even in older documents. Register rendered entities with a shared navigation world to connect this setting to walking:

```ts
import { PhaserAdventureNavigation } from '@pointlesh/phaser';

const navigation = new PhaserAdventureNavigation(scene, () => walkablePolygons(room));
navigation.register(sprite, {
  kind: 'character', controller: actor,
  properties: () => currentCharacter().properties,
  footprint: { width: 40, height: 12 },
});
navigation.register(crateSprite, {
  kind: 'object', properties: () => currentCrate().properties,
  footprint: { width: 50, height: 20 },
});
await actor.walkTo({ x: 500, y: 370 });
// Arrow/joystick input and approach use the same registered geometry.
actor.setMovementDirection({ x: 1, y: 0 });
```

Footprints describe occupied ground in world pixels, centered on each sprite's position/foot anchor. They can be getters for live size edits. The default is 60% of display width and 10% of display height for characters, or full display width and 20% of height for objects. Choose explicit logical footprints when animation frame transforms or perspective change visual bounds; the demo derives stable ground sizes from base image dimensions and authored scale, independent of scaled variants. Tall artwork does not block the ground behind its head.

The world expands each obstacle by the mover's footprint so the whole body clears it, excludes the mover itself, and reads positions, visibility and `walkThrough` on each movement step. Hidden, inactive, disabled or destroyed entities do not block. `walkThrough: true` makes that entity passable to others; it does not make its own controller ignore other solid entities. Background click walks detour; directional input stops at the first obstacle. Pending and restored walks replan if their remaining route becomes blocked. This is local pathfinding, without crowd coordination or physics pushing.

Registration binds a controller's live navigation source. Explicit walkable arguments override the bound floor, and explicit obstacle arguments add to registered blockers. Destroying the sprite, the scene or the returned registration removes the body and binding; `navigation.destroy()` detaches the whole world. Re-registering a sprite replaces its previous registration.

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

The overlay clips a duplicate background to the authored polygon and draws it at the area's baseline. WebGL uses a stencil polygon to sample the original texture directly, including on high-DPI canvases; Canvas uses a geometry mask. The WebGL adapter reserves stencil bit `0x80` during its draw and clears it afterward. Actors with smaller foot Y appear behind the scenery, and actors with larger foot Y appear in front. Use identical transforms on the base and duplicate backgrounds, and the same `depthOffset` on actors and overlays. `sync()` respects the area's independent walk-behind switch. `destroy()` removes the mask, its graphics and the supplied image; pass `destroyImage: false` to retain the image and restore its render node. Scene shutdown cleans up automatically.

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

The forest demo uses nearest sampling for sprites and smooth pixel-art sampling for room textures. Keep `antialias: true`, `antialiasGL: false`, and `roundPixels: false` for continuous camera zoom. It also renders the canvas at its displayed physical resolution:

```ts
import { installPhaserDisplayResolution } from '@pointlesh/phaser';

// Install in create(), after setting texture scaling.
installPhaserDisplayResolution(scene.game, { maxPixelRatio: 2 });
```

This avoids scaling a detailed variant into a fixed 960 × 540 canvas and then rescaling that canvas in the browser. The backing resolution follows CSS size and device pixel ratio; game dimensions, cameras, hit testing and designer coordinates remain unchanged. The default pixel-ratio cap is 2 to limit GPU cost. This Phaser 4 WebGL adapter maps the canvas framebuffer's viewport and scissor to physical pixels; offscreen render targets retain their explicit resolution. Canvas-renderer games retain their configured resolution. It selects CSS `image-rendering: auto`, handles resize and device-pixel-ratio changes, and cleans up on game destruction (or `destroy()`). Install only once per game; repeated calls return the same installation.

For pixel-art assets, inspect the source PNG at native resolution as well as the final canvas. Nearest-neighbor preserves softened colors already generated into the image. At fractional scales, individual source pixels can cover different numbers of screen pixels; changing to `smooth-pixel-art` trades that unevenness for softer boundaries. Keep animation frames on a consistent source grid and palette when crisp, consistent pixel shapes matter. See the [Phaser 4 Pixel Art Guide](https://github.com/phaserjs/phaser/blob/master/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md).

References: [Phaser texture filters](https://docs.phaser.io/api-documentation/4.0.0/namespace/textures-filtermode), [Phaser 4 rendering](https://phaser.io/tutorials/phaser-4-rendering-concepts), and [MDN canvas image rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-rendering).

## Scaled variants

AI Assets owns scaled variants in its source-version metadata and designer. The standard loader preloads them; `AiAssetRuntime` automatically selects the closest available resolution for bound objects and animations, accounting for camera zoom, parent transforms, canvas size and device pixel ratio. `PhaserAdventureCharacter` continues to use its logical base size and animation timing. No prefab or controller dimensions change when a texture switches.

For custom rendering, use AI Assets' `selectScaledVariant` and `aiScaledVariantTextureKey`, or `runtime.applyScaledVariant(sprite, assetId, { width, height })` with explicit screen-pixel dimensions. The forest demo uses the selector before baking legacy room atlases, retains the chosen variant's native resolution, and applies the same world-space dimensions to the background and every walk-behind copy.

## Native scene designer plus adventure inspector

```ts
import { installPhaserPointleshDesigner } from '@pointlesh/phaser';

const editor = installPhaserPointleshDesigner({
  scene, manifest: sceneManifest, aiAssets: assetManifest,
  defaultSceneId: 'village',
  renderSceneObjects: false, // The game already owns its actor sprites.
  getCharacter: (instanceId, sceneId) => liveCharacters.get(instanceId),
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

`installPhaserPointleshDesigner` installs these helpers and exposes them as `areaBaseline` and `areaEdgeHandles`. Standalone integrations can use `installPhaserAreaBaseline({ scene, designer, inspector })` and `installPhaserAreaEdgeHandles({ scene, designer })`; both accept an optional camera getter and return `sync()` and `destroy()`. Native selection and manifest changes keep the controls synchronized. Scene shutdown or `editor.destroy()` cleans up the panels, drawings, and input handlers.

## Named point markers

The combined installer includes `pointHandles`, which draws named coordinate markers while the scene/prefab designer is open. Dragging changes native X/Y overrides (or prefab defaults) in one undo step. Markers follow camera pan/zoom and page layout, respect hidden/locked layers and instances, and never become game sprites or navigation obstacles. `installPhaserPointHandles({ scene, designer, inspector })` is available separately.

When the game owns its sprites (`renderSceneObjects: false`), supply `getSceneObject(objectId, sceneId)` to map resolved native object IDs to live Phaser sprites. The eye control then hides their rendering only while the scene designer is open, without changing game visibility, animation, collisions or navigation. Closing the designer restores rendering, and lock controls only restrict editing.

Supply `getCharacter(instanceId, sceneId)` to connect the point inspector's **Character** dropdown and **Move character here** / **Walk character here** buttons to live `CharacterController` instances. Controllers should already be registered with `PhaserAdventureNavigation`; walking uses their current floors and obstacles. Continue ticking those actors while the designer is open. Movement previews do not change the manifest.

Use `approachPointleshEntity` from core before dispatching hotspot/object interactions. It resolves optional `walkPointId` references from the current room and returns false when exact arrival is impossible or interrupted. Points and entry mappings stay in core data; game code chooses which entry point belongs to each room transition.

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
