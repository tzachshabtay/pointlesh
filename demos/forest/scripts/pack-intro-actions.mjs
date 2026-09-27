// Import generated poses at a single anatomical scale, with planted feet.
// Find silhouettes within each row: AI margins need not coincide with grid cells.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const [guardFile, kingFile] = process.argv.slice(2);
if (!kingFile) throw new Error('Usage: pack-intro-actions.mjs GUARD_SHEET KING_SHEET');
const publicDir = new URL('../public/', import.meta.url);
const ink = (png, x, y) => png.data[(y * png.width + x) * 4 + 3] > 16;

function poses(png) {
  const boxes = [];
  for (let row = 0; row < 2; row++) {
    const top = Math.round(row * png.height / 2), bottom = Math.round((row + 1) * png.height / 2);
    const runs = [];
    let start;
    for (let x = 0; x <= png.width; x++) {
      let occupied = false;
      if (x < png.width) for (let y = top; y < bottom; y++) if (ink(png, x, y)) { occupied = true; break; }
      if (occupied && start === undefined) start = x;
      if (!occupied && start !== undefined) { runs.push([start, x]); start = undefined; }
    }
    if (runs.length !== 4) throw new Error(`Expected four separate poses in row ${row}, found ${runs.length}`);
    for (const [left, right] of runs) {
      let y0 = bottom, y1 = top;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (ink(png, x, y)) {
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      let footLeft = right, footRight = left;
      for (let y = y1 - 12; y <= y1; y++) for (let x = left; x < right; x++) if (ink(png, x, y)) {
        footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x);
      }
      boxes.push({ left, top: y0, width: right - left, height: y1 - y0 + 1, footX: (footLeft + footRight) / 2 });
    }
  }
  return boxes;
}

async function pack(file, destination, width, height, baseline, scale) {
  const source = PNG.sync.read(await readFile(file));
  const cells = poses(source);
  const sheet = new PNG({ width: width * 4, height: height * 2 });
  for (const [i, { footX, ...box }] of cells.entries()) {
    const w = Math.round(box.width * scale), h = Math.round(box.height * scale);
    const x = Math.round(width / 2 - (footX - box.left) * scale), y = baseline - h;
    if (x < 2 || y < 2 || x + w > width - 2 || y + h > height - 2) throw new Error(`Pose ${i} clips its cell`);
    const frame = PNG.sync.read(await sharp(file).extract(box).resize(w, h, { kernel: 'nearest' }).png().toBuffer());
    PNG.bitblt(frame, sheet, 0, 0, w, h, i % 4 * width + x, Math.floor(i / 4) * height + y);
  }
  const output = new URL(destination, publicDir);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, PNG.sync.write(sheet));
  console.log(JSON.stringify({ destination, width, height, baseline, scale, cells }));
}

// The wider spear stage expands the canvas, not the orc's body. Both scales
// match the current promoted characters; raised hands keep their overhead room.
await pack(guardFile, 'art/characters/guard/point-spear.png', 320, 220, 213, 160 / 326);
await pack(kingFile, 'art/characters/king/hands-up.png', 100, 140, 118, 95 / 363);
