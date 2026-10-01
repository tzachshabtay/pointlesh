// Import generated poses at one scale with a shared chest-foot anchor.
import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const sourceFile = process.argv[2];
if (!sourceFile) throw new Error('Usage: node pack-chest-art.mjs SPRITESHEET.png');
const source = PNG.sync.read(await readFile(sourceFile));
const baseFile = new URL('../public/art/objects/runed-tool-chest.png', import.meta.url);
const base = PNG.sync.read(await readFile(baseFile));
const ink = (image, x, y) => image.data[(y * image.width + x) * 4 + 3] >= 32;
const runs = values => {
  const result = []; let start;
  for (let i = 0; i <= values.length; i++) {
    if (values[i] && start === undefined) start = i;
    if (!values[i] && start !== undefined) { if (i - start > 3) result.push([start, i]); start = undefined; }
  }
  return result;
};
const rows = runs(Array.from({ length: source.height }, (_, y) => Array.from({ length: source.width }, (_, x) => ink(source, x, y)).some(Boolean)));
if (rows.length !== 3) throw new Error(`Expected three transparent-separated rows, found ${rows.length}`);
const frames = [];
for (const [top, bottom] of rows) {
  const columns = runs(Array.from({ length: source.width }, (_, x) => Array.from({ length: bottom - top }, (_, y) => ink(source, x, top + y)).some(Boolean)));
  if (columns.length !== 3) throw new Error('Expected three separate chest poses per row');
  for (const [left, right] of columns) {
    let minY = bottom, maxY = top;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (ink(source, x, y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    frames.push({ left, top: minY, width: right - left, height: maxY - minY + 1 });
  }
}
const frameWidth = 120, frameHeight = 120;
let baseLeft = base.width, baseRight = 0, baseBottom = 0;
for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) if (ink(base, x, y)) {
  baseLeft = Math.min(baseLeft, x); baseRight = Math.max(baseRight, x); baseBottom = Math.max(baseBottom, y);
}
const scale = (baseRight - baseLeft + 1) / frames[0].width;
const baseline = baseBottom + frameHeight - base.height, center = (baseLeft + baseRight + 1) / 2;
const sheet = new PNG({ width: frameWidth * 3, height: frameHeight * 3 });
for (const [index, bounds] of frames.entries()) {
  const width = Math.round(bounds.width * scale), height = Math.round(bounds.height * scale);
  const x = Math.round(center - width / 2), y = baseline - height + 1;
  if (x < 0 || y < 0 || x + width > frameWidth || y + height > frameHeight) throw new Error('A chest pose does not fit without cropping');
  const image = PNG.sync.read(await sharp(sourceFile).extract(bounds).resize(width, height, { kernel: 'nearest' }).png().toBuffer());
  PNG.bitblt(image, sheet, 0, 0, width, height, index % 3 * frameWidth + x, Math.floor(index / 3) * frameHeight + y);
}
const padded = new PNG({ width: frameWidth, height: frameHeight });
PNG.bitblt(base, padded, 0, 0, base.width, base.height, 0, frameHeight - base.height);
// The first animation pose is pixel-identical to the existing closed chest.
PNG.bitblt(padded, sheet, 0, 0, frameWidth, frameHeight, 0, 0);
await writeFile(new URL('../public/art/objects/runed-tool-chest-padded.png', import.meta.url), PNG.sync.write(padded));
await writeFile(new URL('../public/art/objects/runed-tool-chest-open.png', import.meta.url), PNG.sync.write(sheet));
console.log(JSON.stringify({ frames, scale, frameWidth, frameHeight, baseline }));
