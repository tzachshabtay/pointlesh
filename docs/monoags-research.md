# MonoAGS research and Pointlesh scope

Research completed before Pointlesh implementation against [MonoAGS](https://github.com/tzachshabtay/MonoAGS), commit `b273fe8b8d402645e3246df935217b3e1071d5c1`. The repository documentation, public API, relevant implementation classes, editor structure, and test inventory were inspected. This is a feature-family inventory, not a claim that every engine behavior was executed. Pointlesh is an independent TypeScript implementation, not a port of MonoAGS source.

## Feature inventory

| Family | MonoAGS capabilities | Pointlesh decision |
| --- | --- | --- |
| Entities and extension | Entities contain replaceable components; components can be added/removed during play, bind dependencies, emit property changes, and declare editor dependencies. Interfaces can be replaced via dependency injection. | Use scene-designer prefabs, JSON extension properties and registered behavior identifiers; keep runtime services replaceable. |
| Objects | Room membership, parent/child transforms, positions, scale, pivot, rotation, tint/opacity, visibility, enablement, animation, render layer, shader, borders, hotspot and collision behavior. | Reuse scene-designer object rendering and asset references; add adventure-specific object data and interaction hooks. |
| Characters | Objects plus directional walking, facing, following, approaching, speaking, outfits, inventory. | Implement walking/facing/approach/speaking/idle and extension points. Leave specialized follower AI to clients. |
| Navigation | Walkable mask union, closest walkable target, pathfinding, straight walking, forced walking, cancellation, debug paths, scaling-dependent speed. | Editable polygon navigation with obstacle routing, explicit unreachable results and interruption. Path data is available for a client to draw its own preview. |
| Areas | Walkable, walk-behind, scaling and zoom components; one area can have multiple roles, enablement and entity restrictions. Geometry can change at runtime. | First-class scene-designer prefabs for all four families, plus hotspots. |
| Hotspots and interactions | Hover text, walk point, arbitrary verbs, inventory-on-object interactions, per-item handlers and default fallbacks. Any object can become a hotspot. | Data-first hotspot and object prefabs, explicit approach before interaction, client-defined puzzle handlers. |
| Inventory | Per-character inventory, active item, item combination handlers, default combination response, inventory UI. | Persist inventory and selected item; demo exercises collection, combinations and inventory use. |
| Rooms | IDs, animated backgrounds, camera limits, optional player visibility, music, objects/areas, edge triggers, lifecycle events and custom properties. | Scene-backed rooms, transitions and persistent room state; ordinary TypeScript controls events. |
| Transitions | Instant, fade, cross-fade, box, dissolve and slide; duration/easing and custom transition interface. | Keep a small transition mechanism; custom presentation remains client code. |
| Camera and viewports | Target following, smooth scrolling and zoom, room bounds, rotation, secondary viewports, split screen, per-viewport visibility/depth clipping, projection boxes, viewport parenting and interaction toggles. | Main camera and zone-driven scale/zoom preview; defer split screen and render-pipeline features. |
| Animation | Frame sequences and sprite sheets, directional sets, loop count/style, ping-pong/backwards playback, timing, random frame delays, individual sprite transforms and frame sound emitters. | Use ai-assets asset definitions and scene-designer presentation; implement character activity/direction selection and frame-linked movement. |
| Speech | Timed/click/external advance, text placement, portrait placement, text style and labels, voiced lines, before-speech hook, simultaneous walking/speaking animation. | Common speaking/idle state and cancellable completion; dialog-designer owns conversation content and flow. |
| Dialogs | Choices, labels and appearance, show-once options, speak-choice flag, action lists, startup actions, nested dialogs/control flow and custom layout. | Integrate dialog-designer rather than inventing another dialog editor/runtime. |
| Cutscenes | Running/skipping state, keyboard/mouse skip policies; individual engine actions finish immediately when skipping. | Small checkpointed runner with explicit final-state application on skip; scripts remain TypeScript. |
| Audio | Clips and playback instances, repeat/pause/seek/completion, type/master volume, sound modifiers, panning, location-aware emitters, frame sounds, speech lookup and room music cross-fading. | Reuse ai-assets references; playback/presentation can be supplied by the client. |
| GUI and text | Panels, scrolling, labels, buttons, checkboxes/radios, text boxes, lists/comboboxes, sliders, inventory windows, message boxes, trees, stack layout, focus/modal input, skins, mouse events. Text supports wrapping/fitting, shadows, outlines, padding and high-resolution layers. Borders include solid, gradient and nine-slice. | Use React/browser UI and existing designers; no new generic widget toolkit. |
| Rendering | Background/foreground/UI/speech layers, depth sorting, per-layer resolution, parallax, textures/filtering/wrap, custom rendering and shaders, render/display pipelines. | Existing scene-designer plus a compact demo renderer; no graphics backend. |
| Effects and timing | Transform/color/audio tweens, easing, chaining/parallel composition, pause/resume/repeat, custom tweens, screen shake, one-time/repeat counters. | Ordinary TypeScript and focused hooks; persist puzzle timers when required. |
| Game/application | Factories, game state, runtime settings, virtual resolution/aspect ratio, window mode, vsync, audio settings, input, lifecycle/render/resize events, blocking/nonblocking repeated execution. | Small platform-independent runtime core; browser/demo integration owns application concerns. |
| Resources/platform | Embedded/packed resources, graphics/audio/fonts, texture caching, platform adapters for desktop/mobile, Mono/.NET/Xamarin/OpenTK/SDL/OpenAL. | NPM packages and browser assets; no platform abstraction stack. |
| Saves | Protobuf object-graph contracts, custom properties, restart snapshot and post-load rewiring/event. | Replace with validated, versioned, pure-data snapshots and explicit extension data. |
| Editor | Game canvas, live inspector, object tree/display-list inspection, move/resize/rotate/pivot handles, scalar/color/enum/object editors, factories/method wizards, undo/redo, serialization/code generation and debug tools. | Extend scene-designer where geometry and visual tuning benefit from immediate feedback. |

Sources: [entities](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/entities.md), [objects](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/objects.md), [characters](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/characters.md), [rooms](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/rooms.md), [viewports](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/viewports.md), [animations](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/animations.md), [dialogs](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/dialogs.md), [audio](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/audio.md), [GUI](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/guis.md), [tweens](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/tweens.md), [game](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/game.md), [editor source](https://github.com/tzachshabtay/MonoAGS/tree/master/Source/Editor/AGS.Editor).

## Character behavior worth preserving

### Movement linked to animation

MonoAGS enables `MovementLinkedToAnimation` by default. Each new animation frame permits one displacement step; the distance should match how far a planted foot travels between sprite frames. Tune speed through frame duration, not by arbitrarily increasing displacement. A single-frame walk automatically uses smooth movement. Scale areas can proportionally change speed, keeping perspective movement credible. Path preview is a developer-facing debug feature. [Walking documentation](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/walking.md).

The implementation additionally compensates between animation steps when the viewport scrolls, checks walkability during motion, cancels old walking instructions when a newer one arrives, aborts on room changes, and restores the idle animation in `finally`. It searches candidate nearby walkable destinations and merges enabled, unrestricted walkable masks before pathfinding. Pointlesh should use elapsed milliseconds, bounded steps, explicit navigation failure, and no movement through invalid segments; it should not copy frame-rate-dependent arithmetic or arbitrary task delays. [Walk implementation](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Objects/Characters/Walking/AGSWalkComponent.cs).

### Facing and approaching

Facing accepts a direction, position, or target object. The engine selects available directional art with fallback ordering; four-way sets work without diagonal frames. Pointlesh should separate logical facing from available art and document browser coordinates: origin at top left, positive Y downward. MonoAGS uses a bottom-left origin, so its angle thresholds must not be copied directly. [Facing implementation](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Objects/Characters/FaceDirection/AGSFaceDirectionComponent.cs).

Approach policy is per verb: do nothing, face only, walk when a configured walk point exists, or always walk to the target. Walking failure prevents interaction completion. Defaults are face for look and walk-if-point for interact. A walk point is an author-chosen standing position, which can differ from the image's center or an obstructed hotspot. Pointlesh should also allow final facing independently of the walk point. [Approach component](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Player/Approach/AGSApproachComponent.cs), [default policy](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Player/Approach/AGSApproachStyle.cs).

### Speaking, walking and idle

MonoAGS selects speaking animation, text, optional portrait and audio, then restores the previous activity only if another action has not changed animation meanwhile. Speaking stops walking unless an explicit combined speak-and-walk outfit exists. If that walk finishes during speech, return to idle. Skip behavior can depend on elapsed text duration, audio completion, mouse input, or an external signal. Pointlesh needs explicit ownership of current activity so completion of an old speech/walk cannot overwrite a newer action. [Speech implementation](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Objects/Characters/Talking/AGSSayComponent.cs).

Outfits are named directional animation collections, including idle, walk, speak, and client-defined actions. Changing outfit normally selects idle in the existing facing. An idle animation is a standing activity; timed fidgets are optional client behavior rather than a mandatory engine scheduler. [Outfit source](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Objects/Characters/Outfit/HasOutfitComponent.cs).

## Area semantics and designer value

Walk-behind masks redraw background fragments above an actor only when its foot position lies behind a baseline. Baseline and mask are independent concepts. A useful editor shows both and lets the author move an actor across the boundary.

Scaling interpolates a factor across a selected axis; separate flags control X/Y scaling and emitted volume. Zoom areas interpolate camera zoom from the tracked target's location, with the camera smoothing toward its goal. An actor can ignore scaling. Areas support allow/deny restrictions and independently enabled roles; mutating their shape or transform is permitted. MonoAGS implements raster masks and describes vectors as future work; Pointlesh uses scene-designer polygons because editable vertices give immediate, legible feedback. [Area documentation](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/areas.md).

Hotspot geometry should remain distinct from navigation geometry. Its visual bounds, click shape, approach point, hover name, verbs, enabled state, and client behavior identifiers all belong in an editable prefab. Object and character prefabs can carry these same interaction properties. [Hotspot documentation](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/hotspots.md).

## Save/load findings and replacement design

The user's concern about MonoAGS saves is supported by specific source findings:

1. `Save` catches and logs exceptions without propagating failure. It writes directly to the final file, so a failed write can replace a previously good save with partial data.
2. `Load` cleans live state and clears entity IDs before opening/deserializing the candidate. A missing or corrupt save can therefore destroy the running session. Its failure path lacks a `finally` restoring pause state.
3. Both save and load change the pause flag without preserving its previous value. Asynchronous wrappers run the same operations on worker threads.
4. Contract subtype identifiers are allocated dynamically while reflecting over types; there is no explicit game/schema migration envelope in this service.

These are observations of the implementation, not results of executing corruption tests. [Save/load service](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Serialization/AGSSaveLoad.cs).

The character contract contains an explicit TODO about cloned animation/outfit identity and does not include `MovementLinkedToAnimation`, active walking instructions, facing or speech state. The serialization context explicitly works around duplicate player instances. Object contracts omit previous-room state. Client behavior state must be manually placed into global/entity/room properties according to the extension documentation. [Character contract](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Serialization/Contracts/ContractCharacter.cs), [serialization context](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Serialization/AGSSerializationContext.cs), [object contract](https://github.com/tzachshabtay/MonoAGS/blob/master/Source/Engine/AGS.Engine/Serialization/Contracts/ContractObject.cs), [customization documentation](https://github.com/tzachshabtay/MonoAGS/blob/master/Docs/articles/customizations.md).

Pointlesh saves should have a format version, game ID, content/schema version, timestamp and integrity checksum. Payloads contain pure JSON and stable IDs: current room, actor positions/facing, inventory, puzzle flags, dialog state, checkpoint state and namespaced extension data. Asset definitions, functions, promises, browser elements and event listeners remain outside saves. Parse, integrity-check, migrate, validate and clone a candidate before returning it to the client for atomic adoption. Storage writes must report failure and preserve the prior completed record on supported adapters. Unknown versions, incompatible game IDs, malformed geometry/state and corrupt data fail clearly.

Saving a resolved activity checkpoint is acceptable when documented; serializing a JavaScript call stack is not. Cutscene skips should apply explicit final effects, so skipping and watching end in equivalent puzzle state. Dialog progress and timing-puzzle counters belong in the save payload rather than hidden closures.

## Acceptance priorities

- Visual editing: polygons, approach points, actor anchors, baselines, scaling/zoom gradients and custom prefab fields affect a live preview.
- Movement: concave routes, obstacles, disconnected walkable islands, interruption, facing, frame-linked speed, single-frame fallback and return to idle behave predictably.
- Persistence: a fresh runtime restores a meaningful mid-puzzle save; wrong-game/corrupt saves are rejected; failed loads leave the current state untouched; client extension fields survive.
- Integration: ai-assets defines the asset catalog, scene-designer carries rooms/prefabs, dialog-designer runs conversations; Pointlesh adds adventure behavior without duplicating their editors.
- Demo: multiple traversable forest/village/mine/camp rooms, inventory and conversation puzzles, a readable recoverable timing puzzle, introductory and rescue cutscenes, and save/load controls.

General physics, a language/parser, full widget toolkit, native rendering/audio backends, networking, exhaustive transition packs, shader authoring, platform windows and arbitrary script-stack persistence are outside the initial library's purpose.
