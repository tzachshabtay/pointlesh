// Import only the small generated clean plate beneath the original cooking pot.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const [unlitFile] = process.argv.slice(2);
if (!unlitFile) throw new Error('Usage: node pack-cottage-hearth.mjs UNLIT_HEARTH.png');
const art = new URL('../public/art/', import.meta.url);
const cottage = PNG.sync.read(await sharp(new URL('atlas-house-forest.png', art).pathname)
  .extract({ left: 0, top: 0, width: 1182, height: 664 }).png().toBuffer());
const clean = PNG.sync.read(await sharp(unlitFile).resize(148, 160, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
for (let y = 339; y < 368; y++) for (let x = 809; x < 884; x++) {
  // Retain the pot's original lower contour; change the fire beneath/around it.
  if (y < 345 && x >= 826 && x < 864 || y < 349 && x >= 834 && x < 858) continue;
  const feather = Math.min(1, (x - 808) / 3, (884 - x) / 3, (y - 338) / 3, (368 - y) / 3);
  const from = ((y - 238) * clean.width + x - 760) * 4, to = (y * cottage.width + x) * 4;
  for (let channel = 0; channel < 3; channel++) cottage.data[to + channel] = Math.round(cottage.data[to + channel] * (1 - feather) + clean.data[from + channel] * feather);
}
await writeFile(new URL('house-unlit.png', art), PNG.sync.write(cottage));
console.log('Imported the cottage clean plate; all pixels outside the firebox remain original.');
