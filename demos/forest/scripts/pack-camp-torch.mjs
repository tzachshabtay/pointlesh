// Remove the painted torch flame while retaining the original holder and camp.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const [unlitFile] = process.argv.slice(2);
if (!unlitFile) throw new Error('Usage: node pack-camp-torch.mjs UNLIT_TORCH.png');
const art = new URL('../public/art/', import.meta.url);
const camp = PNG.sync.read(await readFile(new URL('camp-unlit.png', art)));
const clean = PNG.sync.read(await sharp(unlitFile).resize(80, 120, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
for (let y = 214; y < 267; y++) for (let x = 37; x < 64; x++) {
  const feather = Math.min(1, (x - 36) / 2, (64 - x) / 2, (y - 213) / 2, (267 - y) / 2);
  // The generated holder sits higher than the original. Register the wooden
  // clean plate 12 pixels lower, keeping its replacement rim out of the patch.
  const from = ((y - 196) * clean.width + x - 16) * 4, to = (y * camp.width + x) * 4;
  for (let channel = 0; channel < 3; channel++) camp.data[to + channel] = Math.round(camp.data[to + channel] * (1 - feather) + clean.data[from + channel] * feather);
}
await writeFile(new URL('camp-ambient.png', art), PNG.sync.write(camp));
console.log('Imported the torch clean plate; the holder and all scenery outside the flame patch remain original.');
