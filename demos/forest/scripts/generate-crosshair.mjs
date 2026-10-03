import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

// The five-pixel yellow glint from the inventory click sheet, centered at the pointer.
const size = 16, frames = [0, .2, .45, .7, 1, .7, .45, .2];
const sheet = Buffer.alloc(size * frames.length * size * 4), base = Buffer.alloc(size * size * 4);
for (const [frame, glow] of frames.entries()) {
  const pixels = Buffer.alloc(size * size * 4);
  const rect = (left, top, width, height, color) => {
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) pixels.set(color, (y * size + x) * 4);
  };
  for (const [x, y] of [[7, 6], [6, 7], [7, 7], [8, 7], [7, 8]])
    rect(x, y, 1, 1, [255, 236, 164, Math.round(145 + 110 * glow)]);
  if (!frame) pixels.copy(base);
  for (let row = 0; row < size; row++) pixels.copy(sheet, (row * size * frames.length + frame * size) * 4, row * size * 4, (row + 1) * size * 4);
}
const directory = new URL('../public/art/interface/', import.meta.url);
await mkdir(directory, { recursive: true });
await sharp(base, { raw: { width: size, height: size, channels: 4 } }).png().toFile(new URL('cursor.crosshair.png', directory).pathname);
await sharp(sheet, { raw: { width: size * frames.length, height: size, channels: 4 } }).png().toFile(new URL('cursor.crosshair.idle.png', directory).pathname);
console.log('Wrote the yellow inventory glint and its eight-frame sparkle loop.');
