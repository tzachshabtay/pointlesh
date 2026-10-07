// Import a color-only AI edit without importing its geometry changes. Alpha,
// frame positions, texture detail and non-target materials remain original.
// Usage: node match-cinematic-palettes.mjs KING_SOURCE KING_COLOR_REFERENCE DOOR_SOURCE DOOR_COLOR_REFERENCE PUBLIC_DIR
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const [kingSource, kingReference, doorSource, doorReference, destination] = process.argv.slice(2);
if (!destination) throw new Error('Expected four source/reference PNGs and a public output directory');
const hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const hue = !d ? 0 : max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, max ? d / max : 0, max];
};
const rgb = (h, s, v) => {
  const c = v * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = v - c;
  const parts = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return parts.map(p => Math.round((p + m) * 255));
};
const select = (h, s, v, kind) => s > .16 && v > .12 && (kind === 'king' ? h > 190 && h < 260 : h > 18 && h < 55);
function palette(png, kind) {
  const colors = [];
  for (let i = 0; i < png.data.length; i += 4) {
    const color = hsv(...png.data.subarray(i, i + 3));
    if (png.data[i + 3] > 240 && select(...color, kind)) colors.push(color);
  }
  if (!colors.length) throw new Error(`No ${kind} palette found`);
  return [0, 1, 2].map(k => colors.map(c => c[k]).sort((a, b) => a - b)[Math.floor(colors.length / 2)]);
}
async function match(sourceFile, referenceFile, kind, outputFile) {
  const source = PNG.sync.read(await readFile(sourceFile));
  const before = palette(source, kind), after = referenceFile.endsWith('.json')
    ? JSON.parse(await readFile(referenceFile, 'utf8'))[kind]
    : palette(PNG.sync.read(await readFile(referenceFile)), kind);
  const shift = after[0] - before[0], saturation = after[1] / before[1], value = after[2] / before[2];
  let changed = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    const [h, s, v] = hsv(...source.data.subarray(i, i + 3));
    if (!source.data[i + 3] || !select(h, s, v, kind)) continue;
    const next = rgb((h + shift + 360) % 360, Math.min(1, s * saturation), Math.min(1, v * value));
    source.data.set(next, i); changed++;
  }
  await writeFile(resolve(destination, outputFile), PNG.sync.write(source));
  console.log(JSON.stringify({ kind, before, after, shift, saturation, value, changed }));
  return source;
}
await match(kingSource, kingReference, 'king', 'art/characters/king/hands-up.png');
const door = await match(doorSource, doorReference, 'door', 'art/objects/cage-door-open.png');
const closed = new PNG({ width: 240, height: 230 });
PNG.bitblt(door, closed, 0, 0, 240, 230, 0, 0);
await writeFile(resolve(destination, 'art/objects/cage-door.png'), PNG.sync.write(closed));
