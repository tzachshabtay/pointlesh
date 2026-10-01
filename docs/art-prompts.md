# Forest demo art

These original pixel-art room backgrounds were generated with the built-in `image_gen` tool, then copied unmodified into the project. There are no external runtime image dependencies. The guard patrol artwork added later uses the sprite import process documented below.

The six original character seeds are code-authored pixel art in `demos/forest/src/sprites.ts`; later designer promotions can replace them. Each seed has separate front, back, and left-profile drawings; the editable right-facing prefab slot mirrors the left profile. Each view includes four walk frames, two idle frames, and two speaking frames, all 24 × 32 pixels. The PNGs in `demos/forest/public/art/characters/` include a 24 × 32 `base.png` still, a 192 × 96 sheet, and nine animation strips per character. The base image is the first front-facing idle frame. AI Assets registers this still as the parent image and links each strip as a native animation, so its designer previews the same sequences used by the game.

Regenerate the 66 committed PNGs with `npx tsx demos/forest/scripts/generate-character-art.ts`. Add `--promote` to explicitly update the authored manifests with the character image and animation definitions and prefab direction slots. Promotion changes the known generated parent sheet path to `base.png`, removes its frame grid, and preserves custom version files and the selected version. It also preserves unrelated manifest entries, existing custom direction slots, and custom area shapes; it updates only untouched legacy floor and foreground rectangles to the demo's vector outlines. Normal builds never regenerate art or replace authored manifests. The generator uses Node's built-in PNG compression and requires no image-generation service.

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

## Grub's animated patrol

The September 2026 patrol uses the promoted 40 × 80 reference `demos/forest/public/art/guard.promoted-1790287059346.png`. Three original sheets were generated with the built-in image tool, with that image as the reference. No fallback image-generation API was used. Each requested sheet had four columns and two rows, eight consecutive poses, native transparency, a fixed camera and consistent scale, planted boots, and no scenery, shadows, text, or grid. Equipment, colors, armor, helmet and proportions were to match the reference.

The generated sources were imported with `demos/forest/scripts/pack-guard-patrol-art.mjs FACE_BACK.png FACE_BACK_LEFT.png DRINK.png`. This is texture packing: one uniform scale per sheet, nearest-neighbor sampling, transparent padding and a shared foot pivot. It preserves the bending poses, rejects cropping and does not stretch individual poses to equal heights. Original generated source files were retained in the image tool's output directory.

Final assets in `demos/forest/public/art/characters/guard/`:

| File | Layout | Playback |
| --- | --- | --- |
| `face-back.png` | 4 × 2, eight 40 × 80 frames | Front-to-back turn, retained in Assets but no longer used by the patrol. |
| `face-back-left.png` | 4 × 2, eight 40 × 80 frames | Back-to-left turn, retained in Assets but no longer used by the patrol. |
| `drink.png` | 4 × 2, eight 40 × 80 frames | Bend, drink, straighten; longer holds on the drinking poses. |
| `patrol-idle-back.png` | 3 × 3, eight 40 × 80 frames | Uses the last two back-facing poses of `face-back.png`, one four-second cycle. The prior promoted version remains available. |

### Saved animation prompts

These prompts are registered with the corresponding linked AI Assets animations for future regeneration, alongside the base-image reference:

**Face front to back:** The exact guard from the base image turns smoothly in place from front-facing through a side view to fully back-facing. Eight consecutive frames, stable scale and planted feet; preserve his armor, helmet, spear, palette and proportions. Transparent background; no scenery or shadows.

**Face back to left:** The exact guard from the base image turns in place from fully back-facing to a left-facing profile. Eight consecutive quarter-turn frames that also play smoothly in reverse; stable scale and planted feet. Preserve all equipment and proportions. Transparent background; no scenery or shadows.

**Drink:** The exact guard from the base image bends toward a cauldron off-canvas to his left, drinks, and straightens. Eight consecutive frames: lean down, bend and gulp, then stand upright. Preserve his gear, scale and planted feet. Do not draw the cauldron, scenery, cast shadows or text; transparent background.

## Rescue props and collapse (September 26, 2026)

Generated using the built-in image tool. The chest references `art/atlas-mine-camp.png`; the collapse references the current guard, `art/guard.promoted-1790374400713.png`.

**Runed chest production prompt:**

Use case: stylized-concept. Asset type: one isolated transparent PNG sprite for a point-and-click pixel-art game. The input image is a STYLE, LIGHTING and PERSPECTIVE reference only: match its upper-panel dwarven gold mine pixel art. Generate a closed DWARVEN RUNED TOOL CHEST, a squat substantial oak wooden coffer with aged iron corner bands, a central iron lock and three small carved angular glowing amber runes across its front. Clearly a chest with a hinged fitted lid, not an open crate. Warm lantern illumination from upper left, rich warm dark wood and muted iron, restrained amber runes, hand-painted detailed pixel-art texture matching the reference. Slightly elevated three-quarter view with front and right side visible, about twice as wide as tall, resting level on the ground. Single chest only, no room, no rock platform, no items sticking out, no lettering, no glow halo, no watermark. Actual transparent alpha background including outside the contact edge. Fill most of the image with a little transparent padding. Render suitable to read at approximately 100 by 70 game pixels.

**Collapse production prompt:**

Use case: identity-preserve. Create a production pixel-art ANIMATION SPRITESHEET of the EXACT green orc guard in the reference: same face, short dark hair, tusks, layered brown leather and iron shoulder armor, brown boots, belt skull and spear. He has just drunk a sleeping potion and collapses unconscious (nonviolent, no injury). Eight DIFFERENT sequential frames arranged in a strict 4-column by 2-row grid, reading left to right then next row. Transparent alpha background everywhere outside the characters; no black background, glow, scenery, numbers, labels or drawn grid. Sheet aspect ratio 2:1, ideally 2048x1024 with eight 512-square equal cells. Fixed camera, fixed anatomical proportions and pixel-art detail, absolutely no scale changes between frames. All frames have the same invisible ground baseline at 90% cell height; his planted feet initially are at 67% cell width, leaving space to fall to his LEFT. Every pose entirely inside its own cell with clear gutters. Frame 1: standing, three-quarter facing left, same guard, just finished drinking. Frame 2: drowsy, drooping eyes, knees soften, hand to stomach. Frame 3: staggering leaning left, knees bending, spear slips. Frame 4: down on one knee, torso leaning left. Frame 5: both knees down, hand reaching toward ground on left, falling. Frame 6: shoulder touching ground, legs folding behind. Frame 7: almost lying, head settles to left, body stretched toward right. Frame 8: completely unconscious lying on his SIDE, head LEFT and boots RIGHT, clearly horizontal on the ground, eyes shut, relaxed body with same armor, fallen spear resting beside him. Final two frames anatomically natural, not a rigid rotation of a standing pose. Standing body height approximately 65% of cell height, and lying body length approximately that same size; never enlarge fallen frames to fill the cell. Match the reference exactly in costume and character identity throughout.

Final game files: `demos/forest/public/art/objects/runed-tool-chest.png` (120 × 80) and `demos/forest/public/art/characters/guard/collapse.png` (4 × 2 cells, each 240 × 200). `scripts/pack-rescue-art.mjs` detects actual transparent gutters and imports the poses with one uniform scale and a common ground baseline. Playback skips the initial drinking pose, then holds the last lying frame. The collapse uses a canvas twice the standing character's width, preserving body size while leaving room to fall.


## Rescue action assets — 26 September 2026

Mode: built-in image generation, with the current Borin base, Grub collapse frame, and original camp/door as references. All final files are copied into `demos/forest/public/art/`; no runtime asset relies on the generator output directory.

| Asset | Final file |
| --- | --- |
| Bound Grub | `characters/guard/bound.png` |
| Borin tying from behind | `characters/borin/tie-rope-back.png` |
| Borin using the pickaxe | `characters/borin/pickaxe-back.png` |
| Closed cage door | `objects/cage-door.png` |
| Lock breaking / door opening | `objects/cage-door-open.png` |
| Camp without the moving door | `camp-doorless.png` |

`demos/forest/scripts/pack-rescue-actions.mjs` imports the generated sheets with nearest-neighbor resampling, one fixed scale per animation, and explicit foot/hinge anchors. It preserves alpha and uses frame zero as the closed door. Only the door-sized patch of the generated clean plate replaces the original background; every other pixel remains original.

Reference inputs: promoted Borin `art/borin.promoted-1790377204354.png` (100×140); final 240×200 frame of `art/characters/guard/collapse.png`; camp crop (0,666,1182,664) and door crop (744,875,128,207) from `art/atlas-mine-camp.png`. The extracted door reference informed the final animation; the shipped still is its first frame.

Final prompt set:

### guard-bound

```text
Use case: identity-preserve. Edit target: the supplied transparent sprite of Grub, the sleeping green orc lying on his side, head left and boots right. Create the SAME pose, exact armor, face, spear, proportions and detailed pixel-art style, but now securely tied with real thick tan climbing rope. Several believable tight wraps around his torso trapping his arms at his sides, and rope around both ankles, with small convincing knots. His face remains visible, eyes shut. Rope must be painted naturally around the volume of his body, not flat straight lines. Keep his complete horizontal body and fallen spear in the same position and scale within the exact same wide transparent canvas; preserve all empty transparent space above him and the ground baseline near the bottom. Do not crop to the body or enlarge it. No extra figures, background, floor, text, injury, glow or shadows. Actual transparent alpha. This is one still game asset, not a sheet.
```

### borin-tie-back

```text
Use case: identity-preserve. Reference image is Borin's character identity: stout dwarf, metal conical helmet with nasal guard, orange braided beard, dark teal green tunic, brown belt and leather gloves and boots. Create a pixel-art animation SPRITESHEET of Borin TYING A ROPE while seen FROM BEHIND. Back of helmet, back of tunic and shoulders face the camera; face and beard are not front-facing. Eight sequential distinct poses, 4 columns by 2 rows, equal square cells, transparent gutters, actual transparent alpha. Frame1 standing facing away; frame2 bending and kneeling; frame3 both gloved hands reach forward/down holding tan rope; frame4 passes rope around something immediately ahead off-canvas; frame5 crosses the ends; frame6 pulls the knot tight; frame7 releases rope and starts to rise; frame8 standing facing away again. Show only Borin and the short rope in his hands, NOT the orc or environment. Same anatomical size and planted feet baseline in every cell, consistent costume, camera and lighting. Kneeling poses genuinely shorter, never enlarged to fill the cell. Use reference's detailed textured pixel art, no cartoon simplification, no labels/numbers/grid lines, no shadows, no scenery. Leave padding for arms. Sheet ratio2:1, preferably1600x800.
```

### borin-pickaxe-back

```text
Use case: identity-preserve. Reference image is Borin's exact character identity and textured pixel-art style: small stout dwarf, conical metal helmet, orange braids, dark teal-green tunic, brown belt, leather gloves and boots. Make a production animation SPRITESHEET of Borin striking a lock with a dwarven steel PICKAXE while viewed FROM BEHIND, slightly turned to his right. Eight distinct chronological frames in 4 columns x2 rows of equal square cells; transparent alpha and transparent gutters. Frame1 standing facing away holding wooden-handled steel pickaxe; frame2 lifts it; frame3 raises over shoulder; frame4 pickaxe fully above helmet at apex; frame5 powerful forward downswing toward an imaginary lock ahead at chest height; frame6 impact follow-through; frame7 recoils/lower weapon; frame8 settles standing. Only Borin and the pickaxe, absolutely no door, lock, wall, floor, particles, shadows or scenery. Same body dimensions, grounded feet and anatomical scale throughout, padding above for weapon, all poses within their cells, no independent zoom or crop. Back of helmet/tunic toward viewer, no front-facing face. Crisp detailed hand-painted pixel art matching reference, not low-detail cartoon. No text, numbers, watermarks or grid lines. Sheet aspect2:1 preferably1600x800.
```

### camp-doorless

```text
Use case: precise-object-edit. Image1 is the EDIT TARGET, the entire pixel-art orc camp background. Image2 is a close crop identifying the ONLY part to remove: the small narrow wooden barred hinged DOOR LEAF on the LEFT front face of the cage, including its iron padlock and the leaf's horizontal rails and vertical bars. Remove that entire moving door leaf and padlock, revealing the dark EMPTY cage interior behind this existing rectangular doorway. No character inside. KEEP the stationary cage frame/posts/header/threshold, the broad RIGHT cage wall and all its bars, roof beams, tent, cauldron, palisade, trees, barrel, rocks and lighting EXACTLY unchanged and in the same pixel positions. Do not draw the door in an open position anywhere: the door is entirely absent so the game can add an animated sprite. The opening should have naturally textured dark interior and dirt floor, not a flat black rectangle. This is a precise local background clean plate, absolutely not a redesigned scene. Keep original landscape framing/aspect; no crop, camera change, added props or text.
```

### cage-door-base

```text
Use case: background-extraction. Edit target: the provided close-up of the ORIGINAL cage door from our game's background. Extract ONLY its narrow moving wooden barred door leaf and iron padlock as one transparent PNG sprite. Preserve exact original weathered golden-brown timber, irregular shape, three narrow vertical timber bars, top/bottom frame and two intermediate horizontal rails, rope lashings, highlights, iron padlock at right edge, original front-on slight perspective. Do NOT redesign, straighten, simplify or replace it with an iron-bar gate. Remove all stationary cage posts, any cage wall, all ground and every dark background pixel seen THROUGH the bars, so gaps really are transparent. Same proportions and arrangement as reference. Full isolated CLOSED locked door with transparent padding, centered in original128x207 aspect ratio, actual transparent alpha. No environment, backdrop, new frame, labels, text or shadows.
```

### cage-door-open

```text
Use case: identity-preserve. Input image1 is the extracted ORIGINAL wooden cage DOOR LEAF from our game, including its iron padlock. Input image2 is the original close crop for material/perspective context only. Produce ONE spritesheet of this exact leaf's padlock breaking and the leaf swinging OPEN toward the viewer and to the LEFT, around a fixed hinge on its LEFT EDGE. Eight chronological frames, exactly4columns x2rows, square cells with transparent gutters, transparent alpha THROUGH all gaps between bars and outside the door. Same textured golden-brown timber, same bar and rail counts, knots, chipped highlights and proportions. No stationary cage frame, floor or scenery, no character or weapon. Fixed camera, fixed door height, fixed hinge position near cell center in every frame and fixed ground baseline; NEVER center the leaf separately per frame. Leave plenty of space to the LEFT of hinge for its swing. Frame1 closed locked leaf extends right from hinge. Frame2 same closed leaf, small impact with padlock shackle broken. Frame3 padlock falling, leaf still closed. Frame4 leaf swings30degrees outward. Frame5 swings60degrees. Frame6 swings90degrees, seen nearly edge-on at hinge. Frame7 swings120degrees outward toward left. Frame8 fully open about145degrees, leaf extends to LEFT of hinge and the doorway to its right is completely clear; padlock fallen out of sight. Keep panels all fully inside their own cells. No text, grid lines, labels, glow or watermarks. This must be usable animation of the reference door, not a redesigned gate. Wide2:1 sheet preferably2048x1024.
```

## Copper Tankard fireplace

Mode: **built-in image generation** with the original hearth as a reference. Runtime reflected light is a separate library effect synchronized with these frames; it samples the existing room texture so the bricks never move or change shape. Color, radius, offset, intensity and per-frame brightness belong to the fireplace prefab.

Saved files under `demos/forest/public/art/`:

- `objects/fireplace.png` — 80×104 base image, identical to frame zero.
- `objects/fireplace-burn.png` — eight 80×104 frames, 4 columns × 2 rows, 8 fps, looping.
- `pub-unlit.png` — 1182×664 original pub with only the flames inside the hearth removed.

Reference: `atlas-village-pub.png`, crop `(665,874,150,132)`. The pub occupies `(0,666,1182,664)` in that atlas. `pack-fireplace-art.mjs` imports the fixed cells with one uniform nearest-neighbor scale and composites the clean plate only inside the original firebox. All pixels outside that patch remain unchanged.

Prompt set, normalized for reuse:

```text
Fire loop: Use the supplied Copper Tankard hearth as the color and pixel-art reference. Create eight successive frames of warm yellow-white and orange flames with glowing coals and rising sparks, in exactly four columns and two rows of equal cells. Keep the same coal bed, scale, camera and baseline in every cell. Vary the flame silhouettes naturally and make the last frame flow into the first. Actual transparent alpha. No bricks, stone arch, grate, logs, scenery, text or grid lines. Crisp pixel art matching the reference.

Alpha refinement: Preserve this exact eight-frame sheet, its four-by-two layout, positions, scale, flames, sparks and glowing coals. Remove dark brown/black background and diffuse glow, leaving actual transparency around the crisp flames. Do not redraw, rearrange or independently resize frames.

Unlit hearth: Edit the supplied hearth crop, removing only the flames and sparks. Reconstruct the soot-dark brown bricks behind them. Keep the existing grate, logs, arch, stone rim, brick positions, ambient lighting, pixel style and framing unchanged. No new objects. Keep the background opaque. This is a precise local clean plate, not a redesigned fireplace.
```

## Borin’s cottage fireplace

Mode: **built-in image generation** for a local clean plate; the existing fireplace animation and prefab are reused at a smaller scale. Saved background: `demos/forest/public/art/house-unlit.png` (1182×664). Reference: crop `(760,238,148,160)` from `atlas-house-forest.png`.

`pack-cottage-hearth.mjs` imports only the flame patch at `(809,339)` through `(884,368)`, preserving the original pot’s lower contour and all other room pixels. The scene’s editable cooking-pot walk-behind keeps the flames beneath/behind the pot. The shared library’s reflected light illuminates that foreground copy as well as the stone surround and floor, below the actors.

Final prompt:

```text
Use case: precise-object-edit. Edit target: the supplied close crop of the fireplace in Borin's cottage, a detailed pixel-art game background. Remove ONLY the small yellow/orange flames and luminous embers UNDER the hanging iron cooking pot, leaving a cold, dark bed of charred logs/coals there. Preserve the iron pot itself, its outline, highlights, rim, handle and hanging chain EXACTLY unchanged, together with the surrounding stone arch, bricks, hearth ledge, warm ambient lighting and every other object. Keep the exact composition, framing and pixel-art style; no redesign, camera movement, new props, text or transparency. The game will add animated flames behind the existing pot. This is a very small local clean-plate edit, not a new fireplace.
```

## Orc camp cauldron fire

Mode: **built-in image generation**, editing the 240×184 crop at `(132,280)` of `camp-doorless.png`. Final background: `demos/forest/public/art/camp-unlit.png` (1182×664). The original cage-door clean plate remains intact.

`pack-camp-hearth.mjs` imports only the flame patch at `(185,369)` through `(307,434)`, including flames against the pot’s lower contour. All other pixels, including the upper cauldron, tripod, stone ring exterior and cage, remain original. `camp.fireplace` uses the shared eight-frame `fireplace.burn` asset, fitted to the wider coal bed. Its editable cauldron walk-behind masks the flames; synchronized reflected light reaches both the iron pot and surrounding ground, below the guard.

Final edit prompt:

```text
Use case: precise-object-edit. Asset type: clean background plate for a pixel-art point-and-click game. Input image: edit target, an exact crop of the orc camp cauldron. Remove ONLY the bright orange/yellow flames, floating fire sparks and glowing coals beneath the hanging black iron cauldron. Replace those flames and embers with dark charcoal, charred logs and shaded earth. Preserve the EXACT composition, cauldron shape and texture, tripod legs, hook, surrounding stone ring, wooden table, every other object, existing pixel-art scale, palette, camera and crop. Preserve all cauldron pixels, including its original warm orange reflections; do not redraw or move it. Keep surrounding ground and stones as they are. This will be covered by animated flames and light in the game. No active flame or luminous ember remains. No new objects. Keep the original 240:184 aspect ratio and matching registration.
```

## Orc camp torch

Mode: **built-in image generation**, editing the 80×120 crop at `(16,184)` of `camp-unlit.png`. Final background: `demos/forest/public/art/camp-ambient.png` (1182×664), retaining both earlier cauldron and cage-door clean plates.

`pack-camp-torch.mjs` registers the generated wooden clean plate 12 source pixels lower so its replacement holder never enters the patch, and imports only `(37,214)` through `(64,267)`. The original iron holder and all surrounding scenery remain untouched. `camp.torch` reuses `fireplace.burn` at a narrow torch scale, with independently editable playback and synchronized reflected light on the gate and palisade.

Final edit prompt:

```text
Use case: precise-object-edit. Asset type: clean background plate for a pixel-art point-and-click game. Input image: edit target, an exact 80:120 crop of the torch on the palisade beside the orc camp gate. Remove ONLY the bright yellow/orange torch flame and floating fire sparks above its iron bowl. Reconstruct the original dark vertical wooden palisade slats behind the flame, matching their grain, straight vertical position and existing warm ambient lighting. Preserve the iron torch bowl, rim, wall bracket, support shaft, adjacent gate, all other pixels, original composition, camera and pixel-art style. Do not extinguish or recolor existing reflected light on the wood: dynamic lighting will be added in the game. No flame, sparks or luminous embers remain. No new objects, text, border or transparency. Keep the exact original 80:120 aspect ratio and registration.
```

## Lamps throughout the rooms

Mode: **built-in image generation**, editing five registered contact sheets of the original fixtures. Sixteen light sources: one village lantern, five pub lanterns, three cottage lanterns, three mine lanterns, and three forest lanterns plus the small torch above the distant gate.

Saved files under `demos/forest/public/art/`:

- `objects/lamps/{room}-{lamp}.png` and `{room}-{lamp}-burn.png` — base images and eight-frame 4×2 sheets. Dimensions match each original fixture's pane bounds; the base is frame zero.
- `atlas-village-pub-lamps.png`, `pub-lamps.png`, `house-lamps.png`, `atlas-mine-camp-lamps.png`, and `forest-lamps.png` — room backgrounds with only the authored pane/flame interiors replaced. Earlier hearth edits remain intact.

`lamp-layout.ts` records native crop/pane coordinates and light radii. `prepare-lamp-references.mjs` lays out each room's crops at 2× in a 576×384 contact sheet: three columns, two rows, 192×192 cells and a 16-pixel inset. `pack-lamp-art.mjs` imports the generated dim glass only inside those pane masks, preserving every original housing/bar and all other background pixels. Enclosed lanterns retain their original painted amber glass and wick detail: eight frames blend 86.5–100% of that light over the dim glass, without introducing fire silhouettes, sparks or coals. Their brightest frames exactly reproduce the original artwork. Only the exposed gate torch uses the earlier generated flame sheet. Fixtures vary their playback rate and starting phase; restrained reflected light follows each frame's brightness. All instances are editable under **Objects / Lamps** and render in both gameplay and cutscenes.

Final prompt (one built-in edit per room's contact sheet):

```text
Use case: precise-object-edit. Asset type: registered lamp clean plates for an existing pixel-art game. The input is an EDIT TARGET contact sheet on a flat dark-gray canvas, with lamp crops placed in a fixed 3-column by 2-row layout. Preserve the EXACT canvas aspect ratio, all crop positions, crop sizes, empty space, original metal lantern housings, glass dividers, hanging brackets, background pixels, palette and pixel-art scale. In EVERY occupied crop remove ONLY the yellow-white flames / luminous cores inside the lantern glass, replacing them with dim warm brown translucent glass and dark unlit interiors. For the one exposed flame if present, remove only the flame and reconstruct its immediate background. Keep the existing warm reflections on the housings and surrounding scenery. No flame, sparks, brilliant white patches or glowing core inside any pane. Do not move, redraw, rescale or duplicate any fixture or crop, and do not fill empty cells. This is a carefully registered sprite preparation sheet, not an illustration. No text, new objects, borders or transparency.
```

## Intro: spear threat and surrender

Mode: **built-in image generation**, using the promoted guard base `guard.promoted-1790374400713.png`, guard left idle `guard.idle-left.promoted-1790537131877.png`, and king base `king.promoted-1790370274229.png` as identity references. No existing character animations were replaced.

Saved sheets:

- `demos/forest/public/art/characters/guard/point-spear.png`: eight 320×220 cells, four columns, two rows. The wider stage accommodates the existing spear as it lowers. The rear orc mirrors the same clip to face right.
- `demos/forest/public/art/characters/king/hands-up.png`: eight 100×140 cells, four columns, two rows. Both hands rise above the crown, then remain raised.

`pack-intro-actions.mjs` detects the four separate silhouettes in each generated row instead of cutting at assumed column boundaries. It preserves alpha and applies one nearest-neighbor scale to each entire animation, aligning the boots rather than the moving weapon/hands. The intro stops the approaching guards, starts the spear action at 3000 ms and the king's response at 3650 ms, then holds each final frame until the next shot. Procedural spears, ropes and Borin's drawn arm gesture were removed.

Orc generation prompt:

```text
Use case: identity-preserve. Asset type: transparent pixel-art game animation spritesheet. Create an eight-frame orc SPEAR-POINTING animation using the exact green orc guard design in reference 1, with reference 2 for the existing side-facing armor and proportions. Eight frames arranged in exactly FOUR equal columns and TWO equal rows, read left-to-right top-to-bottom, on a true transparent background. Each cell has ample transparent margins. Character faces LEFT, mostly side-on three-quarter view. In frame 1 he is standing, feet planted, holding his EXISTING single spear upright. Frames 2–6 show him bringing that same spear down and forward toward the LEFT with both hands, ending with the spear aimed horizontally at an unseen captor at chest height. Frames 7–8 settle into that threatening pose. No stabbing/contact, no other characters. Preserve the exact dark hair/topknot, face, green skin, fur pauldrons, brown studded leather and steel armor, belt, boots and long wooden spear with steel leaf blade. Maintain ONE spear and two hands in every frame. Same anatomical body size, camera, lighting and planted boot locations in all cells, no zoom. End pose's entire long horizontal spear must fit inside its own cell. Body is centered at 55% of cell width; feet at 90% of cell height. Keep the same head height throughout, no shrinking to fit the lowered spear. Detailed crisp game pixel-art, matching the reference, no scenery, floor, glow, cast shadow, checkerboard, letters, borders, grid lines, numbering, or labels. True alpha transparency.
```

King generation prompt:

```text
Use case: identity-preserve. Asset type: transparent pixel-art adventure game animation spritesheet. Make an eight-frame HANDS-UP / SURRENDER animation for this exact dwarf king, full body in each frame. Layout exactly FOUR equal columns and TWO equal rows, eight consecutive frames read left-to-right top-to-bottom. True transparent background and generous transparent margins within each cell. Front-facing three-quarter view looking slightly to screen RIGHT. Start with arms at sides and EMPTY HANDS; he is not holding a weapon or sceptre. Frames 2–6: the startled king slowly raises BOTH arms, elbows bend outward, empty palms open and facing the viewer. Frames 7–8: both hands stay clearly ABOVE his crown in a surrender pose. Preserve the exact golden crown with colored jewels, long white moustache and beard, red cape with white ermine collar, ornate blue and gold tunic, gold belt and brown boots. Same head and body dimensions in every frame, feet planted on an identical baseline at 90% of each cell height; no walking, jumping, bobbing, zoom or change of camera. Give enough overhead room so raised hands fit; don't shrink the body to fit the gesture. Match the reference's crisp detailed pixel-art style and warm palette. Only the king; no other characters, ropes, weapons, throne, scenery, floor, halo/glow or cast shadow. No text, labels, borders, grid lines, checkerboard, or numbering. True alpha transparency.
```

King transparency refinement (the reference's actual beard color was retained):

```text
Precise background-extraction edit. Keep this exact eight-frame king hands-up spritesheet: preserve every pose, every crown, face, beard color, costume, body size, cell arrangement, planted foot position, full sheet aspect ratio. REMOVE ONLY the brown/black background and the diffuse orange/brown glow surrounding each king; make all pixels outside the actual king silhouettes fully transparent alpha (alpha zero). Keep all eight characters fully opaque, including the dark boots, dark outlines, cape, dark blue tunic and gold details. No background, checkerboard, shadow, halo or glow whatsoever. Do not redraw, recompose, resize, move, add or remove any character or limb. Output the clean transparent spritesheet with same four columns by two rows.
```

## Room entrances and doors

Mode: **built-in image generation**, editing exact cropped doorway references from the current room backgrounds. Seven matching doors: the pub and cottage on both sides, the Goldroot Mine gate, and both sides of the orc camp gate.

Saved images: `demos/forest/public/art/objects/doors/{village-pub,village-house,pub,house,forest-mine,forest-camp,camp}.png` (base poses) and the corresponding `-open.png` spritesheets (eight frames, four columns by two rows). Closing plays the same poses in reverse. All twenty-one asset definitions are available in **Graphics / Objects / Doors**.

`door-layout.ts` records each reference crop and the original aperture polygon. `pack-door-art.ts` registers each generated frame to that aperture, composites its interior over a dark passage so the old painted door cannot show through, and keeps all surrounding original background pixels unchanged with transparent margins. Except for the originally open exterior pub entrance, the closed pose uses the original painted door. Door-frame walk-behind areas conceal the character behind the existing arch and jambs as they pass through.

Final prompts:

### village-pub

```text
Precise object animation for an existing pixel-art game. Reference is the exact cropped exterior pub doorway. Produce a FOUR-column TWO-row spritesheet, 8 equal cells, each cell the exact same framing/aspect ratio as the reference crop. Animate only its wooden door leaf swinging INWARD, from fully CLOSED at frame 1 to fully OPEN at frame 8; intermediate angles evenly spaced. It closes by playing these frames in reverse. Keep the stone arch, sill, hinges, camera, lighting and original pixel texture at the same pixel coordinates in every frame. In the closed frame extend the existing wood-and-iron door across the opening. The open view reveals the existing dim pub entrance with its warm distant little window. Door retreats into the doorway, does not extend outside the stone arch. NO characters, labels, grid lines, gaps between cells, extra objects, or new doorway design. This is an opaque registered animation patch, not isolated props. Preserve architecture exactly. Every tile fills its cell edge-to-edge. Overall sheet aspect is twice the reference crop aspect.
```

### village-house

```text
Create an exact registered pixel-art animation of the provided cottage door crop. FOUR equal columns by TWO equal rows, EXACTLY EIGHT frames, each tile fills its full cell. Every frame preserves the entire crop framing, door arch and stone jambs in precisely the same positions. Frame 1 is the original CLOSED wooden door. Frames 2–7 swing only this existing door INWARD on its left hinge, progressively 15,30,45,60,75,85 degrees, revealing a dim warm empty cottage interior; frame 8 holds fully open. The same old golden-brown wood, round iron ring on right and existing iron fittings. Preserve the source pixel style, camera and arch shape. No new door, no characters, text, labels, grid lines, empty gutters or extra frames. Opaque background, seamless fixed architecture, no moving sill or wall. Door retreats inside the aperture, never outside the stone frame. Closing uses these frames in reverse.
```

### pub

```text
Precise registered pixel-art animation of this exact pub interior wooden door. Spritesheet with EXACTLY FOUR columns and TWO rows, eight equal cells, no gaps or separators, each cell preserves the complete reference crop framing. Frame 1: original fully closed oak door with black iron strap hinges and pull ring. Frames 2 through 8: door pivots inward on its LEFT hinge, slowly opening into a dim empty passage, final position nearly edge-on at left. Preserve the same arch, stone, wood frame, sill, lighting, texture, perspective and pixel scale, stationary in every frame. Only door leaf moves. No characters, text, labels, decorations, new architecture, other doors, sunlight blast, transparent background or grid lines. Make the final frame fully open and clear enough for a dwarf to walk through. Every cell is the same size and camera registration; each tile fills its cell edge to edge. The reverse playback closes the door.
```

### house

```text
Exact pixel-art game spritesheet based on this existing cottage interior doorway crop. Eight sequential opening frames in FOUR COLUMNS and TWO ROWS, all EIGHT rectangles fully visible, no extra partial columns. Each cell has identical camera framing/aspect ratio and the entire original doorway fills it. The original dark-brown wooden door with two broad iron straps and latch opens INWARD on its left hinges, closed in frame 1, gradually moving to edge-on at left in frame 8. Reveal a dark empty passage. Keep the arch, tree-root jamb, sill, steps, hinges and surrounding wall unchanged and in exactly the same position across frames. Do not redesign or enlarge the doorway. Only the door leaf moves. Reference color palette and coarse crisp pixels. No people, text, borders, numbering, white margins, gutters or unrelated props. No transparency. Final opening wide enough to walk through; reverse playback is closing.
```

### forest-mine

```text
Registered pixel-art sprite animation for this EXACT little wooden mine gate in its existing stone mine entrance. Eight consecutive frames in precisely FOUR columns and TWO rows; exactly 8 complete equal tiles, no extra partial tile. In every tile reproduce the original crop framing, arch, rock, tunnel and path in the same positions. The low wooden barred gate is closed in frame 1, then swings inward on the left hinge into the dark mine through frames 2–7, fully open at frame 8. Keep the gate LOW and barred, exactly like the reference; never turn it into a tall solid door. Preserve worn wood, lantern lighting, old mine stone and crisp original pixel-art. No characters, changes to stone, new objects, labels, text, borders or gutters. Opaque spritesheet. Each tile edge-to-edge identical background/camera. Reverse frames for closing.
```

### forest-camp

```text
Exact cropped orc-palisade double gate opening animation, pixel-art spritesheet. Use this reference unchanged for gate identity, dimensions, wood texture, black iron crossbars, tall spikes and surrounding palisade/ground. Eight equal complete frames: FOUR columns by TWO rows, no extra partial columns. Frame 1 both wooden leaves closed; frames 2–7 both leaves pivot inward around the outer left/right hinges, opening a central gap; frame 8 wide open into a dark empty camp passage. Every tile preserves original crop framing and fixed posts/ground at the same coordinates; only two gate leaves move. No people, floating bars, additional gates, new scenery, labels, text, borders or gutters. Same crisp pixel-art, greenish timber and warm torch light. Opaque patches fill each tile edge-to-edge. Keep both gate leaves visible receding into the opening, no leaf crosses outside the jambs. Reverse playback closes the gate.
```

### camp

```text
Precise object animation edit for an existing pixel-art game. This reference is the exact cropped INSIDE of the orc camp gate. Produce an 8-frame opening animation, exactly FOUR equal columns and TWO equal rows, read left to right top to bottom, with no gutters. Every cell has the same framing and 118:195 aspect ratio as the reference. Keep the gateposts, surrounding dark wooden palisade, little rope at the bottom right, camera, warm lighting and pixel texture absolutely stationary. Animate ONLY this exact wooden gate leaf with its riveted iron horizontal straps and diagonal braces swinging INWARD on its left hinges. Frame1 EXACT original CLOSED pose, frames2-7 smooth increasingly open angles, frame8 fully OPEN revealing a dim empty green forest passage. The leaf recedes into the doorway without protruding outside the posts. Preserve the exact existing weathered wood, diagonal Z brace, iron studs and single door leaf identity. Closing will play these poses backward. No characters, new props, text, labels, grid lines, numbering, margins, borders or redesign. Opaque full-crop registered background patches, not isolated transparent doors. Overall sheet aspect ratio 236:195.
```

## Fixed doorway views and independent door leaves

Mode: **built-in image generation**, precise edits of the existing cottage door sheets and room backgrounds. `pack-door-corrections.ts` supersedes the original per-frame registration for the cottage and tavern: each cottage opening composites a transparent moving leaf over ONE fixed view. A common leaf scale preserves the changing projected width. Only the hinge/baseline is registered; scenery is never fitted separately per frame. The original aperture masks preserve the surrounding architecture and thresholds. The tavern stays open on both sides.

Final saved assets, under `demos/forest/public/art/objects/doors/`:

- `house-open.png`: fixed daylight village view behind the cottage interior leaf.
- `village-house-open.png`: fixed warm interior, preserving the existing stone doorstep.
- `pub.png`, `pub-open.png`: permanent daylight view at the interior pub entrance (last animation frame).
- `village-pub.png`, `village-pub-open.png`: original painted open pub entrance (last animation frame).

Generation specifications for the final prompt set:

- **Cottage interior leaf:** edit the corrected 4×2 cottage door sheet. Extract only the moving wooden leaves and iron hardware; remove all exterior scenery, steps, floor and framing to alpha zero. Preserve eight opening poses, fixed left hinge, height and baseline, with no per-frame resizing.
- **Cottage exterior leaf:** edit the 4×2 exterior cottage door sheet. Keep only its wooden leaf, ring and fittings; remove the room, lanterns, barrels, beams and floor to alpha zero. Preserve fixed hinge/height and the closed-to-edge-on sequence.
- **Cottage outside view:** edit only the far-right doorway aperture of `house-lamps.png`, using `atlas-village-pub-lamps.png` as the village reference. An unobstructed open doorway, no leaf, immediate mossy landing, dirt village square, grass and large tree trunks at the existing scale. No miniature panorama, tiny cottage, toy well, black hallway or added upward steps. Preserve all other architecture, composition and pixel-art style.
- **Pub outside view:** edit only the far-right doorway aperture of `pub-lamps.png`, with the same village reference. Permanently open and unobstructed, no leaf; immediate village dirt and worn stones, grass and full-scale tree trunks. No miniature village or dark hallway. Preserve the room outside the aperture.

The already-generated final exterior cottage open pose supplies its single warm interior plate. Import only the aperture; preserve the original closed pose and doorstep. Tests compare uncovered scenery pixels across frames to prevent future backdrop movement or scale changes.


The cottage and tavern interior views and leaves were rebuilt from registered doorway crops with the actual Bramblehollow reference. See [doorway-art-followup.md](doorway-art-followup.md) for the final saved plates, import coordinates and exact built-in prompts. Those replace the earlier forest-path views; the fixed-backdrop invariant remains in force.

## Borin peeking through the camp gate

Generated with the built-in image-generation tool from the promoted Borin base and left-profile references. The source sheet is `demos/forest/art-source/borin-peek.png`; the game sheet is `demos/forest/public/art/characters/borin/peek.png`. `scripts/pack-peek-art.mjs` packs eight 160×140 frames with a single anatomical scale and a fixed foot anchor, retaining the generated transparency. It appears as **Peek through gate** under Borin's linked animations and holds its final frame while he watches from cover.

Final generation prompt:

> Use case: identity-preserve. Asset type: transparent pixel-art game animation spritesheet. Reference image 1 is Borin's current base image; reference image 2 is his current profile animation, for exact identity, pixel style, clothing and anatomical scale. Create ONE eight-frame sequential animation of this exact dwarf cautiously peeking around a doorway to the RIGHT. Show the complete dwarf, fixed camera, slightly front/side three-quarter right-facing view: frames 1-2 standing cautiously with knees bent; frames 3-4 slowly leaning head and upper body right and reaching right hand forward at chest height to ease a door; frames 5-6 leaning farther to peek; frames 7-8 holding the peek, with a tiny curious head movement. Feet planted at identical baseline in every frame; NO translation, NO size changes. Keep his rounded steel helmet, orange braided beard, forest-green cloak/tunic, brown leather sleeves, gloves, belt and boots exactly as references. One dwarf per cell, no actual door, no frame, no props or environment, no ground shadow or lighting glow. Genuine transparent background. Arrange EXACTLY four columns by two rows, eight equally sized cells, row-major temporal order; ample transparent gutters, never crossing a cell edge. Total canvas 1536 by 1024. Character around 340 pixels tall in each 384x512 cell, soles at local y450, body centered initially at local x170, leaning right into empty margin. Crisp detailed pixel art; do not turn him into a cartoon or smooth painting. No grid lines, labels, text, duplicate limbs, weapons or accessories.
# Borin peeking idle

Generated with the built-in image tool, using the final pose from `demos/forest/art-source/borin-peek.png` as the reference. Source: `demos/forest/art-source/borin-peek-idle.png`; packed sprite: `demos/forest/public/art/characters/borin/peek-idle.png`. The first packed frame is copied exactly from the last frame of `borin.peek`; the remaining frames share one scale and a fixed foot anchor.

```text
Use case: identity-preserve.
Asset type: looping transparent pixel-art character sprite sheet for an adventure game.
Input image 1 is the exact final pose of Borin's existing peeking animation. Continue this precise pose into a quiet eight-frame peeking idle loop.
Create ONE sprite sheet with exactly EIGHT cells in FOUR columns and TWO rows, ordered left to right then top to bottom. Equal cells, ample transparent margins. Borin is the only subject in every cell.
Frame 1 must closely duplicate the reference pose: dwarf feet planted, torso leaned slightly right, head looking right past an unseen doorway, his right hand held out toward the door and his left hand close to his belt. Keep the exact helmet, orange beard, leather armor, green cloak, gloves, boots, proportions, pixel density, palette and shading of the reference.
Across frames 2–8 show subtle living idle motion only: gentle breathing in shoulders and beard, a tiny cautious head shift and blink, a very small hand settle. Feet remain completely planted at the identical x/y and stance. Do not stand upright, walk, wave, turn to camera, change scale, change the costume or add props. Last frame returns close to the first so playback loops smoothly.
Maintain identical anatomical size, foot baseline and camera framing across all eight frames. Never crop helmet, feet or hands. True transparent alpha background everywhere outside Borin, no glow, backdrop, ground, door, labels, separators or text. Crisp detailed pixel art matching the supplied artwork.
```

## Runed tool chest opening

Generated with the **built-in image tool**, using `public/art/objects/runed-tool-chest.png` as the exact identity reference. Final files: `public/art/objects/runed-tool-chest-padded.png` and `public/art/objects/runed-tool-chest-open.png` (paths relative to `demos/forest`).

Nine poses: closed; soft rune glow; bright rune glow; lid cracking; half-open; further open; open with pickaxe; settled open with pickaxe; open and empty. The game plays poses 0–7 once, then holds pose 7 until another interaction collects the pickaxe; pose 8 persists after collection. `scripts/pack-chest-art.mjs` imports transparent-separated poses at one uniform scale and a fixed foot anchor. Frame 0 copies the original chest exactly, with transparent headroom for the raised lid.

Final generation prompt:

```text
Use case: precise-object-edit. Asset type: production pixel-art object spritesheet for a point-and-click game. Input image is the EXACT existing chest to animate, not a loose style reference. Create ONE transparent PNG spritesheet with exactly NINE separate frames in a 3-column by 3-row grid, ordered left-to-right, top-to-bottom. Each equal square cell has wide transparent gutters. Every frame shows this SAME dwarven oak chest, with the SAME iron bands, latch, three angular amber runes, identical perspective (front and right side visible), identical fixed body size, and identical bottom-foot anchor. The chest base never moves, deforms, shrinks or changes perspective. Leave space above it for the lid; retain crisp pixel-art pixels, oak colors and dark iron. Frame 1: exact closed chest, dim runes. Frame 2: the three runes glow softly amber, light reflected subtly in neighboring wood. Frame 3: brighter amber runes. Frame 4: lid cracks open with amber light from within. Frame 5: lid halfway up, hinges at the rear stay fixed. Frame 6: lid opens farther. Frame 7: lid fully open, one wooden-handled steel dwarven pickaxe visible inside. Frame 8: same fully open chest holding the pickaxe, amber rune glow settling. Frame 9: identical fully open chest but empty after the pickaxe has been collected. Keep all frames isolated on actual transparent alpha, no environment, no floor, no shadows outside the object, no labels, no text, no grid lines, no extra objects. Zero camera movement, fixed chest-body proportions and position in every cell. Preserve this exact chest identity and do not redesign it.
```
