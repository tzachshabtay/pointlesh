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
