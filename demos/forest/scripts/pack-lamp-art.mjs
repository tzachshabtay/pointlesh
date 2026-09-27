// Animate the original painted lantern light, without introducing new flames.
// Import only pane interiors into the background; every housing pixel stays put.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
const { lampRooms, lampBounds, lampBrightness, torchBrightness } = await tsImport('../src/lamp-layout.ts', import.meta.url);
const [roomId, generatedFile] = process.argv.slice(2), room = lampRooms[roomId];
if (!room || !generatedFile) throw new Error('Usage: node pack-lamp-art.mjs ROOM GENERATED_CLEAN_SHEET.png');
const art = new URL('../public/art/', import.meta.url);
const background = PNG.sync.read(await readFile(new URL(room.source, art)));
const clean = PNG.sync.read(await sharp(generatedFile).resize(576, 384, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
const source = new URL('objects/fireplace-burn.png', art).pathname;
const output = new URL('objects/lamps/', art); await mkdir(output, { recursive: true });
for (const [index, lamp] of room.lamps.entries()) {
  const bounds = lampBounds(lamp.panes), sheet = new PNG({ width: bounds.width * 4, height: bounds.height * 2 });
  const { width, height } = bounds, phase = index * 3 % 8;
  const brightness = lamp.exposed ? torchBrightness : lampBrightness;
  // Only the exposed gate torch uses a visible flame. Enclosed lanterns retain
  // their original diffused light and wick detail, with a small intensity change.
  const flames = lamp.exposed ? await Promise.all(Array.from({ length: 8 }, async (_, frame) => {
    const sourceFrame = (frame + phase) % 8;
    return PNG.sync.read(await sharp(source).extract({ left: sourceFrame % 4 * 80 + 6, top: Math.floor(sourceFrame / 4) * 104 + 4, width: 68, height: 94 })
      .resize(width, height, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
  })) : [];
  for (const [px, py, pw, ph] of lamp.panes) for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
    const cx = index % 3 * 192 + 16 + (x - lamp.crop[0]) * 2;
    const cy = Math.floor(index / 3) * 192 + 16 + (y - lamp.crop[1]) * 2;
    const src = (cy * clean.width + cx) * 4, target = (y * background.width + x) * 4;
    const base = [...clean.data.subarray(src, src + 3)], lit = [...background.data.subarray(target, target + 3)];
    for (let channel = 0; channel < 3; channel++) background.data[target + channel] = base[channel];
    const lx = x - bounds.x, ly = y - bounds.y, local = (ly * width + lx) * 4;
    for (let frame = 0; frame < 8; frame++) {
      const to = ((Math.floor(frame / 4) * height + ly) * sheet.width + frame % 4 * width + lx) * 4;
      const glow = brightness[(frame + phase) % 8];
      for (let channel = 0; channel < 3; channel++) {
        sheet.data[to + channel] = lamp.exposed ? flames[frame].data[local + channel] : Math.round(base[channel] + (lit[channel] - base[channel]) * glow);
      }
      sheet.data[to + 3] = lamp.exposed ? flames[frame].data[local + 3] : 255;
    }
  }
  const name = `${roomId}-${lamp.id}`;
  const base = new PNG({ width, height }); PNG.bitblt(sheet, base, 0, 0, width, height, 0, 0);
  await writeFile(new URL(`${name}.png`, output), PNG.sync.write(base));
  await writeFile(new URL(`${name}-burn.png`, output), PNG.sync.write(sheet));
}
await writeFile(new URL(room.output, art), PNG.sync.write(background));
console.log(`Packed ${room.lamps.length} ${roomId} lights; fixtures and scenery outside their panes remain original.`);
