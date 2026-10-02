// Pack generated faces into integral frame cells, using one scale for the entire loop.
// This only registers/crops/packs the generated pixels; it does not synthesize expressions.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

for (const id of ['borin', 'king', 'guard', 'elder', 'innkeeper', 'miner']) {
  const source = new URL(`../art-source/portraits/${id}.png`, import.meta.url);
  const bytes = await readFile(source), image = PNG.sync.read(bytes), boxes = [];
  for (let i = 0; i < 8; i++) {
    const x0 = Math.round(i % 4 * image.width / 4), x1 = Math.round((i % 4 + 1) * image.width / 4);
    const y0 = Math.round(Math.floor(i / 4) * image.height / 2), y1 = Math.round((Math.floor(i / 4) + 1) * image.height / 2);
    let left = x1, right = -1, top = y1, bottom = -1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw Error(`${id} frame ${i} is empty`);
    boxes.push({ left, top, width: right - left + 1, height: bottom - top + 1 });
  }
  const scale = Math.min(224 / Math.max(...boxes.map(box => box.width)), 224 / Math.max(...boxes.map(box => box.height)));
  const sheet = new PNG({ width: 1024, height: 512 }), base = new PNG({ width: 256, height: 256 });
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i], width = Math.round(box.width * scale), height = Math.round(box.height * scale);
    const frame = PNG.sync.read(await sharp(bytes).extract(box).resize(width, height, { kernel: 'nearest' }).png().toBuffer());
    const x = Math.round((256 - width) / 2), y = 240 - height;
    PNG.bitblt(frame, sheet, 0, 0, width, height, i % 4 * 256 + x, Math.floor(i / 4) * 256 + y);
    if (i === 0) PNG.bitblt(frame, base, 0, 0, width, height, x, y);
  }
  const destination = new URL('../public/art/portraits/', import.meta.url); await mkdir(destination, { recursive: true });
  await writeFile(new URL(`${id}.png`, destination), PNG.sync.write(base));
  await writeFile(new URL(`${id}.speak.png`, destination), PNG.sync.write(sheet));
  console.log(`${id}: 256×256 face, eight registered speech frames`);
}
