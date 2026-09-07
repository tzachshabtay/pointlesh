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

This reuses scene-designer's native canvas handles, curved polygons, prefab editing and minimap. The adventure inspector adds Pointlesh properties, custom JSON properties, behavior IDs, undo/redo and manifest export. Native selection and manifest changes keep the inspector synchronized. Both tools are cleaned up on scene shutdown or `editor.destroy()`.

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
