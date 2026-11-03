# Door animation palette correction

Mode: built-in image editing, followed by deterministic palette matching during import.

Final runtime assets under `demos/forest/public/art/objects/doors/`: `house-open.png`, `village-house-open.png`, `pub-open.png`, `pub.png`. `village-house-view.png` stores the already-existing fixed interior plate for repeatable imports.

The closed pose remains the original painted door. `pack-door-corrections.ts` matches the generated closed pose's wood and metal distributions to that original, then applies the same mappings to every moving pose. Only the leaf is graded: aperture, transparency and fixed view plates are preserved. Opening and reverse-playback closing share the corrected sheet. Run `npx tsx demos/forest/scripts/pack-door-corrections.ts INPUT_DIRECTORY house pub village-house` with registered native-size `ID-view.png` plates and the edited transparent 4×2 `ID-leaf.png` sheets.

## house

Reference: `demos/forest/public/art/objects/doors/house.png`.

```text
Use case: precise-object-edit. COLOR CORRECTION ONLY. Image 1 is the edit target: an existing 4-column, 2-row sheet of eight moving door poses. Image 2 is ONLY a color reference showing the original closed door. The target's fresh orange wood and silver straps are TOO BRIGHT. The reference has very dark subdued brown oak and muted charcoal/bronze iron. Match that dark appearance. Apply the SAME color correction to ALL EIGHT poses so opening does not change the wood or metal color. Preserve image 1's exact eight poses, cell layout, canvas aspect ratio, silhouettes, positions, widths, heights, fixed hinges, handle/ring positions, wood grain, ironwork and coarse pixel texture. Do not redraw or redesign the door, change any pose, add a stationary frame, add lighting, or add objects. Actual transparent alpha zero background, no black/brown matte, no glow, no shadow, no scenery or checkerboard. Keep every pixel outside the door transparent. Return only the corrected same 4x2 sheet.
```

## village-house

Reference: `demos/forest/public/art/objects/doors/village-house.png`.

```text
Use case: precise-object-edit. COLOR CORRECTION ONLY. Image 1 is the edit target: an existing 4-column, 2-row sheet of eight moving door poses. Image 2 is ONLY a color reference showing the original closed door. The target's luminous yellow/golden wood is TOO BRIGHT and oversaturated. The reference has subdued medium-dark earthy brown oak. Match that brown appearance, including its darker ring and hinges. Remove the yellow edge glow. Apply the SAME color correction to ALL EIGHT poses so opening does not change the wood or metal color. Preserve image 1's exact eight poses, cell layout, canvas aspect ratio, silhouettes, positions, widths, heights, fixed hinges, handle/ring positions, wood grain, ironwork and coarse pixel texture. Do not redraw or redesign the door, change any pose, add a stationary frame, add lighting, or add objects. Actual transparent alpha zero background, no black/brown matte, no glow, no shadow, no scenery or checkerboard. Keep every pixel outside the door transparent. Return only the corrected same 4x2 sheet.
```

## pub

Reference: `tmp/doors/pub-reference.png`.

```text
Use case: precise-object-edit. COLOR CORRECTION ONLY. Image 1 is the edit target: an existing 4-column, 2-row sheet of eight moving door poses. Image 2 is ONLY a color reference showing the original closed door. The target's warm orange wood and silver metal are slightly too bright. Match the reference's subdued dark-brown wood and dark worn iron. Apply the SAME color correction to ALL EIGHT poses so opening does not change the wood or metal color. Preserve image 1's exact eight poses, cell layout, canvas aspect ratio, silhouettes, positions, widths, heights, fixed hinges, handle/ring positions, wood grain, ironwork and coarse pixel texture. Do not redraw or redesign the door, change any pose, add a stationary frame, add lighting, or add objects. Actual transparent alpha zero background, no black/brown matte, no glow, no shadow, no scenery or checkerboard. Keep every pixel outside the door transparent. Return only the corrected same 4x2 sheet.
```
