import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { pointInPolygon } from '@pointlesh/core';
import { forestDoors } from '../src/door-layout.js';

// AI supplies the art: separate transparent 4×2 door-leaf sheets and one still
// view per doorway. Import registration never resizes the view per frame.
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
for (const id of ['house', 'village-house', 'pub', 'village-pub']) {
  const door = forestDoors.find(door => door.id === id)!;
  const { width, height } = door.crop;
  const baseFile = new URL(`art/objects/doors/${id}.png`, publicDir);
  const sheetFile = new URL(`art/objects/doors/${id}-open.png`, publicDir);
  const original = PNG.sync.read(await sharp(new URL(`art/${door.background}`, publicDir).pathname).extract(door.crop).ensureAlpha().png().toBuffer());
  const sheet = door.alwaysOpen ? PNG.sync.read(await readFile(sheetFile)) : new PNG({ width: width * 4, height: height * 2 });
  const left = Math.floor(Math.min(...door.aperture.map(p => p.x))), top = Math.floor(Math.min(...door.aperture.map(p => p.y)));
  const right = Math.ceil(Math.max(...door.aperture.map(p => p.x))), bottom = Math.ceil(Math.max(...door.aperture.map(p => p.y)));
  let backdrop = original;
  if (id === 'house' || id === 'pub') {
    backdrop = PNG.sync.read(await sharp(`${input}/${id}-view.png`).resize(1182, 664, { kernel: 'nearest' }).extract(door.crop).ensureAlpha().png().toBuffer());
  } else if (id === 'village-house') {
    // Register the warm cottage interior ONCE from the open pose, then reuse it.
    const open = cell(await load(`${input}/village-house.png`), 7);
    const view = PNG.sync.read(await sharp(PNG.sync.write(open)).extract(bounds(open)).flatten({ background: '#17140f' })
      .resize(right - left, bottom - top, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
    backdrop = new PNG({ width, height }); PNG.bitblt(view, backdrop, 0, 0, view.width, view.height, left, top);
  }
  const leaves = door.alwaysOpen ? undefined : await load(`${input}/${id}-leaf.png`);
  const closedBounds = leaves && bounds(cell(leaves, 0));
  let base: PNG | undefined;
  for (let i = 0; i < 8; i++) {
    if (door.alwaysOpen && i !== 7) continue;
    let source = backdrop;
    if (!door.alwaysOpen && i === 0) source = original;
    else if (leaves && closedBounds) {
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
    if (i === 0 || door.alwaysOpen) base = frame;
  }
  await writeFile(baseFile, PNG.sync.write(base!));
  await writeFile(sheetFile, PNG.sync.write(sheet));
  console.log(`Packed ${id}: fixed backdrop, registered leaf, original aperture`);
}
