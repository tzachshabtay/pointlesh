// Pack the generated quill poses, retaining their motion and one scale throughout.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const input = await readFile(new URL('../art-source/journal/quill-writing.png', import.meta.url));
const image = PNG.sync.read(input), boxes = [];
const alpha = (x, y) => image.data[(y * image.width + x) * 4 + 3];
for (let col = 0; col < 4; col++) {
  const left = Math.round(col * image.width / 4), right = Math.round((col + 1) * image.width / 4);
  const edges = [0];
  for (let row = 1; row < 4; row++) {
    const target = Math.round(row * image.height / 4);
    const empty = y => { for (let x = left; x < right; x++) if (alpha(x, y) > 16) return false; return true; };
    const gutter = Array.from({ length: 81 }, (_, i) => target - 40 + i).filter(y => empty(y));
    if (!gutter.length) throw new Error(`No transparent gutter before row ${row}, column ${col}`);
    edges.push(gutter.reduce((a, b) => Math.abs(a - target) < Math.abs(b - target) ? a : b));
  }
  edges.push(image.height);
  for (let row = 0; row < 4; row++) {
    let x0 = right, x1 = -1, y0 = edges[row + 1], y1 = -1;
    for (let y = edges[row]; y < edges[row + 1]; y++) for (let x = left; x < right; x++) {
      if (alpha(x, y) <= 16) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 < x0) throw new Error(`Empty frame ${row * 4 + col}`);
    // The feather moves, so register the parchment, not the full silhouette.
    let pageLeft = right, pageRight = -1;
    for (let y = y1 - 40; y <= y1; y++) for (let x = left; x < right; x++) {
      if (alpha(x, y) <= 64) continue;
      pageLeft = Math.min(pageLeft, x); pageRight = Math.max(pageRight, x);
    }
    boxes[row * 4 + col] = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1,
      pageCenter: (pageLeft + pageRight) / 2 - x0 };
  }
}
const scale = Math.min(218 / Math.max(...boxes.map(b => b.width)), 220 / Math.max(...boxes.map(b => b.height)));
const sheet = new PNG({ width: 1024, height: 1024 }), base = new PNG({ width: 256, height: 256 });
for (let i = 0; i < boxes.length; i++) {
  const { pageCenter, ...box } = boxes[i], width = Math.round(box.width * scale), height = Math.round(box.height * scale);
  const frame = PNG.sync.read(await sharp(input).extract(box).resize(width, height, { kernel: 'nearest' }).png().toBuffer());
  const x = Math.round(108 - pageCenter * scale), y = 238 - height;
  if (x < 0 || x + width > 256 || y < 0) throw new Error(`Frame ${i} would crop`);
  PNG.bitblt(frame, sheet, 0, 0, width, height, i % 4 * 256 + x, Math.floor(i / 4) * 256 + y);
  if (i === 15) PNG.bitblt(frame, base, 0, 0, width, height, x, y);
}
await writeFile(new URL('../public/art/journal/quill.write.png', import.meta.url), PNG.sync.write(sheet));
await writeFile(new URL('../public/art/journal/quill.png', import.meta.url), PNG.sync.write(base));
console.log('Journal quill: sixteen registered 256×256 generated frames.');
