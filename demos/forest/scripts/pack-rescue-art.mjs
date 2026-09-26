// Deterministic texture import, preserving generated poses, alpha and one scale.
// Detect real transparent gutters rather than assuming the AI obeyed equal cells.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const [collapseFile, chestFile] = process.argv.slice(2);
if (!collapseFile || !chestFile) throw new Error('Usage: node pack-rescue-art.mjs COLLAPSE.png CHEST.png');
const source = PNG.sync.read(await readFile(collapseFile));
const runs = values => {
  const result = []; let start;
  for (let index = 0; index <= values.length; index++) {
    if (values[index] && start === undefined) start = index;
    if (!values[index] && start !== undefined) { if (index - start > 3) result.push([start, index]); start = undefined; }
  }
  return result;
};
const ink = (x, y) => source.data[(y * source.width + x) * 4 + 3] >= 16;
const rows = runs(Array.from({ length: source.height }, (_, y) => Array.from({ length: source.width }, (_, x) => ink(x, y)).some(Boolean)));
if (rows.length !== 2) throw new Error(`Expected 2 separated animation rows, got ${rows.length}`);
const frames = [];
for (const [top, bottom] of rows) {
  const columns = runs(Array.from({ length: source.width }, (_, x) => Array.from({ length: bottom - top }, (_, y) => ink(x, top + y)).some(Boolean)));
  if (columns.length !== 4) throw new Error(`Expected 4 separated poses per row, got ${columns.length}`);
  for (const [left, right] of columns) {
    let minY = bottom, maxY = top;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (ink(x, y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    frames.push({ left, top: minY, width: right - left, height: maxY - minY + 1 });
  }
}
const frameWidth = 240, frameHeight = 200, baseline = 195;
const scale = Math.min(187 / Math.max(...frames.map(frame => frame.height)), 230 / Math.max(...frames.map(frame => frame.width)));
const sheet = new PNG({ width: frameWidth * 4, height: frameHeight * 2 });
for (const [index, bounds] of frames.entries()) {
  const width = Math.round(bounds.width * scale), height = Math.round(bounds.height * scale);
  const image = PNG.sync.read(await sharp(collapseFile).extract(bounds).resize(width, height, { kernel: 'nearest' }).png().toBuffer());
  PNG.bitblt(image, sheet, 0, 0, width, height, index % 4 * frameWidth + Math.round((frameWidth - width) / 2), Math.floor(index / 4) * frameHeight + baseline - height + 1);
}
const guardDir = new URL('../public/art/characters/guard/', import.meta.url);
const objectDir = new URL('../public/art/objects/', import.meta.url);
await mkdir(guardDir, { recursive: true }); await mkdir(objectDir, { recursive: true });
await writeFile(new URL('collapse.png', guardDir), PNG.sync.write(sheet));
await sharp(chestFile).resize(120, 80, { kernel: 'nearest' }).png().toFile(new URL('runed-tool-chest.png', objectDir).pathname);
console.log(JSON.stringify({ frames, uniformScale: scale, frameWidth, frameHeight, baseline }));
