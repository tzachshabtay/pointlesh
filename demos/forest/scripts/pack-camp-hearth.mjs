// Import the local clean plate without changing the cage or other camp artwork.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const [unlitFile] = process.argv.slice(2);
if (!unlitFile) throw new Error('Usage: node pack-camp-hearth.mjs UNLIT_CAULDRON.png');
const art = new URL('../public/art/', import.meta.url);
const camp = PNG.sync.read(await readFile(new URL('camp-doorless.png', art)));
const clean = PNG.sync.read(await sharp(unlitFile).resize(240, 184, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
for (let y = 369; y < 434; y++) for (let x = 185; x < 307; x++) {
  // Includes the tongues of flame against the very bottom of the pot, leaving
  // its upper body, rim, handle, tripod and the foreground stones untouched.
  const feather = Math.min(1, (x - 184) / 4, (307 - x) / 4, (y - 368) / 4, (434 - y) / 4);
  const from = ((y - 280) * clean.width + x - 132) * 4, to = (y * camp.width + x) * 4;
  for (let channel = 0; channel < 3; channel++) camp.data[to + channel] = Math.round(camp.data[to + channel] * (1 - feather) + clean.data[from + channel] * feather);
}
await writeFile(new URL('camp-unlit.png', art), PNG.sync.write(camp));
console.log('Imported the cauldron clean plate; all pixels outside the flame patch remain original.');
