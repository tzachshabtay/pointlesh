// Fixed cells preserve the authored flicker: never fit each flame independently.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const [fireFile, unlitFile] = process.argv.slice(2);
if (!fireFile || !unlitFile) throw new Error('Usage: node pack-fireplace-art.mjs FIRE.png UNLIT_HEARTH.png');
const art = new URL('../public/art/', import.meta.url);
await mkdir(new URL('objects/', art), { recursive: true });
const source = await sharp(fireFile).metadata();
if (source.width !== 1536 || source.height !== 1024) throw new Error('Expected a 1536 × 1024, 4 × 2 source sheet.');
const width = 80, height = 104;
const sheet = new PNG({ width: width * 4, height: height * 2 });
for (let index = 0; index < 8; index++) {
  const frame = PNG.sync.read(await sharp(fireFile)
    .extract({ left: index % 4 * 384, top: Math.floor(index / 4) * 512, width: 384, height: 512 })
    .resize(78, 104, { kernel: 'nearest' }).png().toBuffer());
  // Eliminate nearly transparent extraction noise; retain the fire's alpha edges.
  for (let offset = 0; offset < frame.data.length; offset += 4) if (frame.data[offset + 3] < 16) frame.data.fill(0, offset, offset + 4);
  PNG.bitblt(frame, sheet, 0, 0, 78, 104, index % 4 * width + 1, Math.floor(index / 4) * height);
}
await writeFile(new URL('objects/fireplace-burn.png', art), PNG.sync.write(sheet));
const base = new PNG({ width, height });
PNG.bitblt(sheet, base, 0, 0, width, height, 0, 0);
await writeFile(new URL('objects/fireplace.png', art), PNG.sync.write(base));

const pub = PNG.sync.read(await sharp(new URL('atlas-village-pub.png', art).pathname)
  .extract({ left: 0, top: 666, width: 1182, height: 664 }).png().toBuffer());
const unlit = PNG.sync.read(await sharp(unlitFile).resize(150, 132, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
// Only the inside of the firebox changes; keep the original stonework and grate.
for (let y = 15; y < 105; y++) for (let x = 44; x < 126; x++) {
  const feather = Math.min(1, (x - 43) / 4, (126 - x) / 4, (y - 14) / 4, (105 - y) / 3);
  const from = (y * unlit.width + x) * 4, to = ((208 + y) * pub.width + 665 + x) * 4;
  for (let channel = 0; channel < 3; channel++) pub.data[to + channel] = Math.round(pub.data[to + channel] * (1 - feather) + unlit.data[from + channel] * feather);
}
await writeFile(new URL('pub-unlit.png', art), PNG.sync.write(pub));
console.log('Packed eight fire frames, base image, and the Copper Tankard clean plate.');
