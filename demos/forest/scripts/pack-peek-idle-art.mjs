// One anatomical scale for the loop; frame zero continues the existing peek exactly.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
const source = new URL('../art-source/borin-peek-idle.png', import.meta.url);
const bytes = await readFile(source), png = PNG.sync.read(bytes);
const peek = PNG.sync.read(await readFile(new URL('../public/art/characters/borin/peek.png', import.meta.url)));
const first = new PNG({ width: 160, height: 140 });
PNG.bitblt(peek, first, 480, 140, 160, 140, 0, 0);
function bounds(image, x0, y0, width, height) {
  let left = Infinity, right = -1, top = Infinity, bottom = -1;
  for (let y = y0; y < y0 + height; y++) for (let x = x0; x < x0 + width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw Error('Empty frame');
  return { left, top, width: right - left + 1, height: bottom - top + 1, bottom };
}
function frameBounds(i) {
  const col = i % 4, row = Math.floor(i / 4);
  const left = Math.round(col * png.width / 4), top = Math.round(row * png.height / 2);
  return bounds(png, left, top, Math.round((col + 1) * png.width / 4) - left, Math.round((row + 1) * png.height / 2) - top);
}
const original = bounds(first, 0, 0, 160, 140), reference = frameBounds(0);
const scale = original.height / reference.height;
const sheet = new PNG({ width: 640, height: 280 });
PNG.bitblt(first, sheet, 0, 0, 160, 140, 0, 0);
for (let i = 1; i < 8; i++) {
  const box = frameBounds(i);
  let footLeft = Infinity, footRight = -1;
  for (let y = box.bottom - 10; y <= box.bottom; y++) for (let x = box.left; x < box.left + box.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 16) { footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x); }
  }
  const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
  const x = Math.round(80 - ((footLeft + footRight) / 2 - box.left) * scale), y = 120 - height;
  if (x < 2 || x + width > 158 || y < 2) throw Error(`Frame ${i} overflows`);
  const frame = PNG.sync.read(await sharp(bytes).extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(width, height, { kernel: 'nearest' }).png().toBuffer());
  PNG.bitblt(frame, sheet, 0, 0, width, height, i % 4 * 160 + x, Math.floor(i / 4) * 140 + y);
}
const destination = new URL('../public/art/characters/borin/peek-idle.png', import.meta.url);
await writeFile(destination, PNG.sync.write(sheet));
console.log(destination.pathname);
