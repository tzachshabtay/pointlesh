import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { pointInPolygon } from '@pointlesh/core';
import { forestDoors } from '../src/door-layout.js';

// AI supplies transparent 4×2 leaf sheets and single registered doorway views.
// Views are native crop dimensions, already masked to the original aperture.
// The same view is composited under EVERY pose, including tavern animation
// previews. Runtime holds its final pose, while close still reverses the sheet.
const input = process.argv[2];
if (!input) throw new Error('Usage: tsx pack-door-corrections.ts INPUT_DIRECTORY');
const publicDir = new URL('../public/', import.meta.url);
const load = async (file: string) => PNG.sync.read(await sharp(file).ensureAlpha().png().toBuffer());
function cell(sheet: PNG, i: number) {
  const left = Math.round(i % 4 * sheet.width / 4), top = Math.round(Math.floor(i / 4) * sheet.height / 2);
  const width = Math.round((i % 4 + 1) * sheet.width / 4) - left;
  const height = Math.round((Math.floor(i / 4) + 1) * sheet.height / 2) - top;
  const frame = new PNG({ width, height }); PNG.bitblt(sheet, frame, left, top, width, height, 0, 0); return frame;
}
function bounds(image: PNG) {
  let left = image.width, top = image.height, right = 0, bottom = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (image.data[(y * image.width + x) * 4 + 3]! > 127) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right <= left || bottom <= top) throw new Error('Empty door art');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
for (const id of ['house', 'pub']) {
  const door = forestDoors.find(door => door.id === id)!;
  const { width, height } = door.crop;
  const baseFile = new URL(`art/objects/doors/${id}.png`, publicDir);
  const sheetFile = new URL(`art/objects/doors/${id}-open.png`, publicDir);
  const original = PNG.sync.read(await sharp(new URL(`art/${door.background}`, publicDir).pathname).extract(door.crop).ensureAlpha().png().toBuffer());
  const sheet = new PNG({ width: width * 4, height: height * 2 });
  const left = Math.floor(Math.min(...door.aperture.map(p => p.x))), top = Math.floor(Math.min(...door.aperture.map(p => p.y)));
  const right = Math.ceil(Math.max(...door.aperture.map(p => p.x))), bottom = Math.ceil(Math.max(...door.aperture.map(p => p.y)));
  const backdrop = await load(`${input}/${id}-view.png`);
  if (backdrop.width !== width || backdrop.height !== height) throw new Error(`${id}: register the still view to the native doorway crop first`);
  const leaves = await load(`${input}/${id}-leaf.png`);
  // Pixel-art leaf masks are binary. Remove generated semi-transparent halo
  // pixels before compositing; they must not darken the fixed scenery per pose.
  for (let offset = 0; offset < leaves.data.length; offset += 4) {
    if (leaves.data[offset + 3]! < 128) leaves.data.fill(0, offset, offset + 4);
    else leaves.data[offset + 3] = 255;
  }
  const closedBounds = bounds(cell(leaves, 0));
  let base: PNG | undefined;
  for (let i = 0; i < 8; i++) {
    let source = backdrop;
    if (i === 0) source = original;
    else {
      const leaf = cell(leaves, i), box = bounds(leaf);
      // One scale for all poses. Only register the hinge and baseline; never
      // stretch a narrow open leaf (or its scenery) to the closed door's width.
      const leafWidth = Math.max(1, Math.round(box.width * (right - left) / closedBounds.width));
      const leafHeight = Math.max(1, Math.round(box.height * (bottom - top) / closedBounds.height));
      const registered = await sharp(PNG.sync.write(leaf)).extract(box)
        .resize(leafWidth, leafHeight, { kernel: 'nearest' }).png().toBuffer();
      source = PNG.sync.read(await sharp(PNG.sync.write(backdrop)).composite([{ input: registered, left, top: bottom - leafHeight }]).png().toBuffer());
    }
    const frame = new PNG({ width, height });
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pointInPolygon({ x: x + .5, y: y + .5 }, door.aperture)) {
      const offset = (y * width + x) * 4;
      source.data.copy(frame.data, offset, offset, offset + 4); frame.data[offset + 3] = 255;
    }
    PNG.bitblt(frame, sheet, 0, 0, width, height, i % 4 * width, Math.floor(i / 4) * height);
    if (i === (door.alwaysOpen ? 7 : 0)) base = frame;
  }
  await writeFile(new URL(`art/objects/doors/${id}-view.png`, publicDir), PNG.sync.write(backdrop));
  await writeFile(baseFile, PNG.sync.write(base!));
  await writeFile(sheetFile, PNG.sync.write(sheet));
  console.log(`Packed ${id}: fixed backdrop, registered leaf, original aperture`);
}
