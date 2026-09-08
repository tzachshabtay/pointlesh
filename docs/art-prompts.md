# Forest demo art

These original pixel-art room backgrounds were generated with the built-in `image_gen` tool, then copied unmodified into the project. There are no external runtime image dependencies. No fallback CLI or post-generation image editing was used.

The six characters are original code-authored pixel art in `demos/forest/src/sprites.ts`. Each has separate front, back, and left-profile drawings; the editable right-facing prefab slot mirrors the left profile. Each view includes four walk frames, two idle frames, and two speaking frames, all 24 × 32 pixels. The PNGs in `demos/forest/public/art/characters/` include a 192 × 96 sheet per character and nine animation strips per character. AI Assets registers each strip as a native animation, linked from its character asset, so its designer previews the same sequences used by the game.

Regenerate the 60 committed PNGs with `npx tsx demos/forest/scripts/generate-character-art.ts`. Add `--promote` to explicitly update the authored manifests with the character animation definitions and prefab direction slots. Promotion preserves unrelated manifest entries, existing custom direction slots, and custom area shapes; it updates only untouched legacy floor and foreground rectangles to the demo's vector outlines. Normal builds never regenerate art or replace authored manifests. The generator uses Node's built-in PNG compression and requires no image-generation service.

The character sheet rows are front, back, and left. Each row contains walk frames 0–3, idle frames 4–5, and speaking frames 6–7. The cinematic textures share this pixel source. These assets use the repository's MIT license.

## Atlas layout

Each PNG is **1182 × 1330 pixels**, containing two approximately 16:9 rooms stacked vertically. Use the source rectangles below to exclude the tiny horizontal divider and prevent adjacent-room bleed. The game can select source rectangles directly; the source images have not been cropped or resampled.

| File in `demos/forest/public/art/` | Top room (x, y, width, height) | Bottom room (x, y, width, height) |
| --- | --- | --- |
| `atlas-village-pub.png` | Dwarf village: `0, 0, 1182, 664` | Village pub: `0, 666, 1182, 664` |
| `atlas-house-forest.png` | Dwarf home: `0, 0, 1182, 664` | Forest crossroads: `0, 666, 1182, 664` |
| `atlas-mine-camp.png` | Gold mine: `0, 0, 1182, 664` | Orc camp: `0, 666, 1182, 664` |

All six rooms have clear foreground walking space and static scenery only. Player characters, inventory objects, interactive hotspots, dialogue, and other dynamic elements are separate game content.

## Asset designer style reference

The demo's AI Assets style guide uses `art/bramblehollow-reference.png`, a lossless export of the existing village atlas frame at `0, 0, 1182, 664`. It contains only Bramblehollow; the original atlas remains unchanged. The style prompt is defined in `demos/forest/src/art-style.ts` and persisted with the reference in `public/authoring/assets.json`. Open **Assets → Define style…** to inspect or edit the shared generation prompt and reference image. This affects asset generation, not the designer's interface colors.

## Final prompts

### Village / pub

```text
Use case: stylized-concept
Asset type: two-room background texture atlas for an actual 2D point-and-click adventure game, The King's Road.
Primary request: create one 1024 x 1152 pixel image divided into EXACTLY TWO equal horizontal panels, each 1024 x 576, top panel dwarf forest village and bottom panel village pub interior. No margin, no border, no gutter, no text. Hard clean horizontal panel boundary exactly at half image height. Each panel must be a complete separate 16:9 game background.
Style/medium: exquisite classic 1990s hand-pixeled fantasy adventure game, low resolution 320 x 180 effective pixels enlarged with nearest neighbor, large visible crisp square pixel clusters, NO smooth gradients or anti-aliasing. Rich atmospheric painted pixel art, emerald and moss greens, old warm wood, amber firelight, ochre pathways, deep blue green shadows. Same consistent pixel grid and art direction across both panels.
TOP PANEL: empty enchanting dwarf village deep in an ancient forest; small cozy timber and round-stone buildings dwarfed by huge ancient trees. A pub entrance on the LEFT, welcoming dwarf cottage entrance on the RIGHT, winding forest path exits toward CENTER BACK. Warm evening sunlight. Huge root framing left, glowing windows, stone well off center, barrels and tiny mushrooms. Walkable open golden dirt ground occupies lower 40 percent of panel; level horizon and camera at traditional side-on adventure-game three-quarter perspective, no aerial isometric view.
BOTTOM PANEL: empty cozy dwarf tavern interior. Counter and kegs along LEFT back wall, a stone hearth on RIGHT wall, tiny amber lamps and warm hearth light, wooden beams, rough plank floor. A door on RIGHT edge, a couple of stools and rustic tables along edges. Broad clear unobstructed walkable foreground occupying lower 40 percent, enough room for player and NPCs to be added later.
Constraints: NO people, NO dwarfs, NO animals, NO characters, NO writing, NO labels, NO logos, NO UI. These are static EMPTY scenery backgrounds. Beautiful playable scene compositions; all doors clearly visible. Crisp chunky pixels, not modern smooth illustration.
```

### House / forest

```text
Use case: stylized-concept
Asset type: two-room background texture atlas for an actual 2D point-and-click adventure game, The King's Road.
Primary request: create one 1024 x 1152 pixel image divided into EXACTLY TWO equal horizontal panels, each 1024 x 576, top panel cozy dwarf home and bottom panel enchanted forest crossroads. No margin, no border, no gutter, no text. Hard clean horizontal panel boundary exactly at half image height. Each panel must be a complete separate 16:9 game background.
Style/medium: exquisite classic 1990s hand-pixeled fantasy adventure game, low resolution 320 x 180 effective pixels enlarged with nearest neighbor, large visible crisp square pixel clusters, NO smooth gradients or anti-aliasing. Rich atmospheric painted pixel art, emerald and moss greens, old warm wood, amber firelight, ochre pathways, deep blue green shadows. Same consistent pixel grid and art direction across both panels.
TOP PANEL: empty cozy dwarf cottage interior built inside the roots of an ancient tree, warm honeyed wood and thick rough stone walls. Low bed with burgundy blanket on LEFT, little shelf above; solid dwarf workbench with rough tools against rear CENTER wall, a small cooking hearth to rear RIGHT, round green forest window, exit door on far RIGHT edge. A small wooden chest sits near bed. Broad clear unobstructed walkable foreground of wooden floor occupying lower 40 percent, enough room for a player to walk. Lovely intimate clutter around edges.
BOTTOM PANEL: empty enchanted ancient forest crossroads on mossy ochre ground. Towering broad twisting oak trunks frame both sides. A gold mine dark rocky entrance in the distant LEFT background, a path deeper into shadowy forest in RIGHT background toward a distant orc palisade glimpse. Forking dirt paths from bottom center, vivid violet mushroom patch near LEFT foreground tree root, old carved wooden signpost at rear center WITHOUT WRITING, tiny motes of warm golden light and mist among trees. Beautiful atmospheric luminous green and teal canopy with shafts of late afternoon sunlight. Broad clear walkable lower 40 percent.
Composition: level horizon and traditional side-on adventure-game three-quarter perspective, NOT aerial, NOT isometric.
Constraints: NO people, NO dwarfs, NO animals, NO characters, NO writing, NO labels, NO logos, NO UI. These are static EMPTY scenery backgrounds. Beautiful playable scene compositions; entrances clearly visible. Crisp chunky pixels, not modern smooth illustration.
```

### Mine / camp

```text
Use case: stylized-concept
Asset type: two-room background texture atlas for an actual 2D point-and-click adventure game, The King's Road.
Primary request: create one 1024 x 1152 pixel image divided into EXACTLY TWO equal horizontal panels, each 1024 x 576, top panel dwarf gold mine interior and bottom panel orc camp in forest. No margin, no border, no gutter, no text. Hard clean horizontal panel boundary exactly at half image height. Each panel must be a complete separate 16:9 game background.
Style/medium: exquisite classic 1990s hand-pixeled fantasy adventure game, low resolution 320 x 180 effective pixels enlarged with nearest neighbor, large visible crisp square pixel clusters, NO smooth gradients or anti-aliasing. Rich atmospheric painted pixel art, emerald and moss greens, old warm wood, amber firelight, ochre pathways, deep blue green shadows. Same consistent pixel grid and art direction across both panels.
TOP PANEL: empty deep dwarf gold mine interior, huge cavern with jagged blue slate walls shot through with bright ochre gold seams. Rough wooden support beams and amber lanterns. Exit tunnel to forest on far LEFT with distant green daylight visible, mine cart near rear CENTER and winding tracks, loose gold ore, a neglected old hand winch with rope at RIGHT center and small tools against wall. Broad clear mostly flat walkable sandy rocky ground across bottom 40 percent, lantern pools of warm gold, distant tunnels in blue black shadow. No giant glowing magic crystal.
BOTTOM PANEL: empty orc camp hidden in ancient forest at twilight. Pointed rough log palisade along rear wall; dark pine and broad oak trees above it, ochre dirt clearing below. A large black stew cauldron over a little amber campfire on LEFT center with a rustic cook table behind, crude hide tent at CENTER background. On RIGHT center stands a sturdy cage made from rough wooden logs, a clearly visible iron-padlocked hinged door. Cage EMPTY because prisoners will be separate game sprites. Rustic rear gate left edge for player entrance. Sparse fallen logs and barrels at edges. Good open walkable foreground across lower 40 percent. Moody moss green and teal with warm low campfire light. Fairy-tale adventure, charming dangerous place rather than horror.
Composition: level horizon and traditional side-on adventure-game three-quarter perspective, NOT aerial, NOT isometric.
Constraints: NO people, NO dwarfs, NO orcs, NO animals, NO characters, NO skeletons, NO weapons on characters, NO writing, NO labels, NO logos, NO UI. These are static EMPTY scenery backgrounds. Beautiful playable scene compositions; important interactions clearly visible. Crisp chunky pixels, not modern smooth illustration.
```

## Scrolling forest panorama

`demos/forest/public/art/forest-wide.png` is a single **2172 × 724 pixel** forest panorama, exactly 3:1, intended for a 1620 × 540 scrolling game room. It was created with the built-in `image_gen` tool using only the bottom forest scene in `atlas-house-forest.png` as the edit target. The prompt requested 3072 × 1024; the tool returned 2172 × 724. No model override or fallback CLI was used. The original atlas and generated source were preserved, and the output was copied into the repository without stretching, cropping, resampling, or other post-generation image edits.

The panorama expands the forest into continuous terrain, keeping the lower path connected, purple dreamcaps at the left root, a timbered mine entrance on the left, the central oak and blank signpost, and an orc gate toward the far right. The visual review confirmed consistent blocky pixel art, green and teal woodland shadows, warm sunshafts, and no characters, lettering, UI, repeated panels, or seams.

### Exact panorama edit prompt

```text
Use case: precise-object-edit
Asset type: a single panoramic scrolling room background for an actual 2D pixel-art point-and-click adventure game.
Input image 1: EDIT TARGET is ONLY the BOTTOM HALF forest crossroads of atlas-house-forest.png. Ignore and remove the TOP HALF cottage completely; no cottage content belongs in the output.
Primary request: expand that forest horizontally into ONE continuous 3:1 wide panorama, ideally 3072 x 1024 pixels. The output must contain only the forest, filling the entire image edge to edge. Keep the same vertical field of view, camera height, atmospheric depth, forest identity, detailed blocky pixel scale, color palette, and lighting as the bottom forest reference. Create genuinely new connected forest scenery across the greater horizontal span; do not stretch or tile the original scene, repeat panels, or miniaturize the scene vertically to fit.
Composition: traditional side-on adventure-game three-quarter perspective, level horizon, not isometric or aerial. Ancient towering oak trunks and mossy roots frame a continuous forest clearing. A generous connected ochre dirt walking path crosses the entire lower third from left edge to right edge, with small natural forks leading into background landmarks. Leave the lower path broadly traversable; place large roots, rocks, and vegetation mostly at its edges. Purple silver-spotted dreamcap mushrooms cluster at the foot of a tree near the left foreground. A dark dwarven mine entrance with timber supports, rocky surround, and one warm lantern sits near the left quarter of the panorama. Around the center, a monumental ancient oak rises behind a little forked wooden signpost with completely blank boards. Toward the far right, the path leads to a crooked orc palisade gate between shadowy trees. The landmarks must be clearly visible and separated by coherent new forest space. One of each landmark; no mirrored copies.
Style and invariants: match the reference's classic richly painted pixel-art game background: distinct crisp square pixel clusters, textured moss and bark, ochre earth, emerald leaves, deep teal and blue-green distant woodland, warm yellow-green afternoon sunshafts and a few tiny golden light motes. Preserve the reference's detailed chunky pixel treatment rather than smoothing it into a modern painting. Natural continuous lighting and ground across the whole panorama.
Constraints: one seamless continuous landscape, no separate panels, no seams, no divider, no borders, no letterboxing, no text or sign lettering, no UI, no labels, no logo, no watermark, no people, no dwarfs, no orcs, no animals, no added characters. Do not include any interior or cottage. Aspect ratio exactly 3:1 horizontal if available.
```
