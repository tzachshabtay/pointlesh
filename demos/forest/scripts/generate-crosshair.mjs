import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

// Fixed pixel positions in every frame keep the pointer's interaction point exact.
const size = 16, frames = [0, .2, .45, .7, 1, .7, .45, .2];
const sheet = Buffer.alloc(size * frames.length * size * 4), base = Buffer.alloc(size * size * 4);
for (const [frame, glow] of frames.entries()) {
  const pixels = Buffer.alloc(size * size * 4);
  const rect = (left, top, width, height, color) => {
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) pixels.set(color, (y * size + x) * 4);
  };
  for (const [x, y, w, h] of [[7, 2, 2, 4], [7, 10, 2, 4], [2, 7, 4, 2], [10, 7, 4, 2]]) {
    rect(x - 1, y - 1, w + 2, h + 2, [30, 34, 28, 210]);
  }
  for (const [x, y, w, h] of [[7, 2, 2, 4], [7, 10, 2, 4], [2, 7, 4, 2], [10, 7, 4, 2]]) {
    rect(x, y, w, h, [Math.round(216 + 28 * glow), Math.round(185 + 32 * glow), Math.round(125 + 38 * glow), Math.round(180 + 60 * glow)]);
  }
  if (!frame) pixels.copy(base);
  for (let row = 0; row < size; row++) pixels.copy(sheet, (row * size * frames.length + frame * size) * 4, row * size * 4, (row + 1) * size * 4);
}
const directory = new URL('../public/art/interface/', import.meta.url);
await mkdir(directory, { recursive: true });
await sharp(base, { raw: { width: size, height: size, channels: 4 } }).png().toFile(new URL('cursor.crosshair.png', directory).pathname);
await sharp(sheet, { raw: { width: size * frames.length, height: size, channels: 4 } }).png().toFile(new URL('cursor.crosshair.idle.png', directory).pathname);
console.log('Wrote a centered crosshair and its eight-frame subtle glow loop.');
