// Pack generated poses with one scale and a fixed foot anchor; no per-frame fit.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
const source = new URL('../art-source/borin-peek.png', import.meta.url);
const png = PNG.sync.read(await readFile(source));
const sheet = new PNG({ width: 640, height: 280 });
const scale = 97 / 340;
for (let i = 0; i < 8; i++) {
  const cellX = i % 4 * png.width / 4, cellY = Math.floor(i / 4) * png.height / 2;
  let left = Infinity, right = -1, top = Infinity, bottom = -1;
  for (let y = cellY; y < cellY + png.height / 2; y++) for (let x = cellX; x < cellX + png.width / 4; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] <= 16) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  let footLeft = Infinity, footRight = -1;
  for (let y = bottom - 10; y <= bottom; y++) for (let x = left; x <= right; x++) if (png.data[(y * png.width + x) * 4 + 3] > 16) { footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x); }
  const width = right - left + 1, height = bottom - top + 1;
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const x = Math.round(80 - ((footLeft + footRight) / 2 - left) * scale), y = 120 - h;
  if (x < 2 || x + w > 158 || y < 2) throw Error(`Frame ${i} overflows`);
  const frame = PNG.sync.read(await sharp(await readFile(source)).extract({ left, top, width, height }).resize(w, h, { kernel: 'nearest' }).png().toBuffer());
  PNG.bitblt(frame, sheet, 0, 0, w, h, i % 4 * 160 + x, Math.floor(i / 4) * 140 + y);
}
const destination = new URL('../public/art/characters/borin/peek.png', import.meta.url);
await mkdir(new URL('.', destination), { recursive: true });
await writeFile(destination, PNG.sync.write(sheet));
console.log(destination.pathname);
