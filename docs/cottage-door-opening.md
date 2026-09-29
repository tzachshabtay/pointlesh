# Fully opening cottage doors

The interior and exterior cottage leaves now rotate to a narrow edge-on pose. The original leaves still covered approximately 40% and 26% of their openings; the replacements cover approximately 16% and 9%, including hinge hardware. The original closed-door pixels, aperture, palette matching, and fixed view plates are retained.

The route follows the original entry–threshold line, continued a short distance beyond the sill. The vertical approach detour and its extra foreground-depth override have been removed. Door leaves and jambs use their authored baselines again.

Mode: built-in imagegen, with the original closed door as the edit reference. Final source sheets and registered view plates are in `demos/forest/art-source/doors/`. The runtime assets are `demos/forest/public/art/objects/doors/house-open.png` and `village-house-open.png`; opening and closing use the same frames in opposite order. `demos/forest/src/door-occlusion.json` is rebuilt from the same source silhouettes.

Rebuild:

```sh
npx tsx demos/forest/scripts/pack-door-corrections.ts demos/forest/art-source/doors house village-house
npx tsx demos/forest/scripts/build-door-occlusion.ts demos/forest/art-source/doors house village-house
```

## Interior prompt

Reference: `demos/forest/public/art/objects/doors/house.png`.

```text
Use case: precise-object-edit. This is the exact original closed wooden door for a pixel-art game. Make its OPENING ANIMATION as a transparent sprite sheet. 4 columns, 2 rows, 8 equal cells. CRITICAL: the door must swing a FULL 90 DEGREES inward about its left hinge, reaching a true nearly invisible edge-on position. It must NOT end partly open. At closed frame1 you see the full wooden face and original latch. In frame2 its projected width is 90% of frame1; frame3 78%; frame4 60%; frame5 40%; frame6 20%; frame7 8%; frame8 ONLY 4% of frame1 width: a VERY THIN VERTICAL DARK LINE of wood thickness, the latch is concealed on the far side, NO visible front face, no wide strip, no broad handle. The narrow final edge is the same height as the left hinge edge in frame1. A rigid slab rotation, not melting; hinge and bottom hinge location remain stationary within all cells; every frame same scale and coordinate origin. Preserve the original dark brown wood, very dark muted iron bands, arch top, pixel texture, door proportions, hardware identity in the frames where the face is visible. No frame or arch surround, no scenery, no lighting glow, no floor, no cast shadows, no labels or numbers. All pixels outside the door are alpha-zero transparent. Return the 8 poses in reading order. Complete door in every cell, with margins. Final pose is just a tiny edge occupying 4% of the CLOSED pose width, which is essential to allow a character to pass.
```

## Exterior prompt

Reference: `demos/forest/public/art/objects/doors/village-house.png`.

```text
Use case: precise-object-edit. This is the exact original OUTSIDE cottage door for a pixel-art game. Make its OPENING ANIMATION as a transparent sprite sheet of ONLY THE MOVING WOODEN DOOR LEAF. 4 columns, 2 rows, 8 equal cells. CRITICAL: the door must swing a FULL 90 DEGREES inward about its left hinge, reaching a true nearly invisible edge-on position. It must NOT end partly open. At closed frame1 you see the full wooden face and original ring handle. In frame2 its projected width is 90% of frame1; frame3 78%; frame4 60%; frame5 40%; frame6 20%; frame7 8%; frame8 ONLY 4% of frame1 width: a VERY THIN VERTICAL DARK LINE of wood thickness, handle concealed on far side, NO visible front face, no wide strip, no broad ring. The narrow final edge is the same height as the left hinge edge in frame1. A rigid slab rotation, not melting; hinge and bottom hinge location remain stationary within all cells; every frame same scale and coordinate origin. Preserve the original subdued dark brown wood, very dark iron studs/hinges/ring handle, rounded arch top, coarse pixel texture, door proportions, hardware identity in frames where face is visible. Do NOT include the doorframe, stone arch, wood tree surround, scenery, floor, cast shadow or glow, labels or numbers. All pixels outside moving door alpha-zero transparent. Return 8 poses in reading order, entire leaf in every cell with margins. The final pose is just a tiny edge occupying 4% of CLOSED pose width, which is essential to allow a character to pass.
```
