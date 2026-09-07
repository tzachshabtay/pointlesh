# Forest demo art

These original pixel-art room backgrounds were generated with the built-in `image_gen` tool, then copied unmodified into the project. There are no external runtime image dependencies. No fallback CLI or post-generation image editing was used.

## Atlas layout

Each PNG is **1182 × 1330 pixels**, containing two approximately 16:9 rooms stacked vertically. Use the source rectangles below to exclude the tiny horizontal divider and prevent adjacent-room bleed. The game can select source rectangles directly; the source images have not been cropped or resampled.

| File in `demos/forest/public/art/` | Top room (x, y, width, height) | Bottom room (x, y, width, height) |
| --- | --- | --- |
| `atlas-village-pub.png` | Dwarf village: `0, 0, 1182, 664` | Village pub: `0, 666, 1182, 664` |
| `atlas-house-forest.png` | Dwarf home: `0, 0, 1182, 664` | Forest crossroads: `0, 666, 1182, 664` |
| `atlas-mine-camp.png` | Gold mine: `0, 0, 1182, 664` | Orc camp: `0, 666, 1182, 664` |

All six rooms have clear foreground walking space and static scenery only. Player characters, inventory objects, interactive hotspots, dialogue, and other dynamic elements are separate game content.

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
