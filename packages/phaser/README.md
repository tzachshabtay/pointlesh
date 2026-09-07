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

The binding places a sprite at the actor's feet, sets depth to foot Y, applies scale areas, and adjusts walking distance to perspective through the controller. Only pass `camera` for the actor that drives camera zoom. `baseScale` is the original sprite scale; scale areas multiply it. `depthOffset` lets your scene reserve lower depths for background art.

An `areas` getter keeps the same binding valid after the designer changes `room`. Scale and zoom interpolate from the minimum to maximum coordinate of the authored axis (`x` or `y`). Later areas of the same kind win when they overlap. Disabled or open areas have no effect. Zoom smoothing is independent of frame rate. `evaluatePointleshAreaEffects()` also exposes these calculations for custom renderers and objects.

For ai-assets animations, supply `aiRuntime`, `assetId` and `animation: state => ...`. The callback returns an authored ai-assets state or animation key. Pointlesh steps its frames using the controller's deterministic clock, including `MovementLinkedToAnimation`, and composes generated frame transforms with perspective scaling. Custom sheets can use the simpler `frame` callback. Keep the controller's frame count and duration aligned with authored walk cycles.

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

The overlay masks a duplicate background to the authored polygon and draws it at the area's baseline. It uses Phaser 4's mask filter in WebGL and a geometry mask in Canvas. Actors with smaller foot Y appear behind the masked scenery, and actors with larger foot Y appear in front. Use identical transforms on the base and duplicate backgrounds. Use the same `depthOffset` on actors and overlays. `destroy()` removes the mask, its graphics and the supplied image; pass `destroyImage: false` to retain the image. Scene shutdown cleans up automatically.

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
