import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
const { lampRooms } = await tsImport('../src/lamp-layout.ts', import.meta.url);
await mkdir('tmp/lamp-references', { recursive: true });
for (const [room, layout] of Object.entries(lampRooms)) {
  const input = new URL('../public/art/' + layout.source, import.meta.url).pathname;
  const tiles = await Promise.all(layout.lamps.map(async (lamp, i) => {
    const [left, top, width, height] = lamp.crop;
    return { input: await sharp(input).extract({ left, top, width, height }).resize(width * 2, height * 2, { kernel: 'nearest' }).png().toBuffer(),
      left: i % 3 * 192 + 16, top: Math.floor(i / 3) * 192 + 16 };
  }));
  await sharp({ create: { width: 576, height: 384, channels: 4, background: '#202020' } }).composite(tiles).png().toFile(`tmp/lamp-references/${room}.png`);
}
