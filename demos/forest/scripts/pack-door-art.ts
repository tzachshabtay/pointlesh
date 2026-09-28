import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { pointInPolygon } from '@pointlesh/core';
import { forestDoors } from '../src/door-layout.js';

const input = process.argv[2];
if (!input) throw new Error('Usage: tsx pack-door-art.ts DIRECTORY_WITH_ID-generated.png');
const publicDir = new URL('../public/', import.meta.url);
type Box = { left: number; top: number; width: number; height: number };

// Generated sheets are registered by the stationary aperture. Their margins,
// row heights and even the number of columns need not match the requested grid.
function sourceBox(id: string, frame: number, width: number, height: number): Box {
  let left: number, top: number, right: number, bottom: number;
  if (id === 'pub') {
    const boxes = [[54,30,277,473],[374,30,635,487],[707,30,973,487],[1060,30,1355,487],
      [54,551,275,1003],[370,551,636,1004],[711,551,976,1004],[1068,551,1361,1004]];
    [left, top, right, bottom] = boxes[frame]!;
  } else {
    let columns = 4, index = frame, split = height / 2;
    let edges = [.15, .06, .83, .956];
    if (id === 'village-pub') { columns = 5; index = [0,1,2,3,5,6,7,9][frame]!; edges = [.14,.12,.83,.93]; }
    if (id === 'village-house') { split = 451; edges = frame < 4 ? [.13,.1,.85,.94] : [.13,.085,.85,.82]; }
    if (id === 'forest-mine') { columns = width / 370; edges = [.15,.08,.83,.865]; }
    if (id === 'forest-camp') edges = [.16,.07,.835,.772];
    if (id === 'camp') edges = [.14,.04,.895,.947];
    const col = id === 'forest-mine' ? frame % 4 : index % columns;
    const row = id === 'forest-mine' ? Math.floor(frame / 4) : Math.floor(index / columns);
    const cellWidth = width / columns, cellHeight = row ? height - split : split;
    left = col * cellWidth + cellWidth * edges[0]!;
    right = col * cellWidth + cellWidth * edges[2]!;
    top = (row ? split : 0) + cellHeight * edges[1]!;
    bottom = (row ? split : 0) + cellHeight * edges[3]!;
  }
  return { left: Math.round(left!), top: Math.round(top!), width: Math.round(right!) - Math.round(left!), height: Math.round(bottom!) - Math.round(top!) };
}

for (const door of forestDoors) {
  const file = `${input}/${door.id}-generated.png`;
  const metadata = await sharp(file).metadata();
  const { width, height } = door.crop;
  const original = PNG.sync.read(await sharp(new URL(`art/${door.background}`, publicDir).pathname).extract(door.crop).png().toBuffer());
  const left = Math.floor(Math.min(...door.aperture.map(p => p.x))), top = Math.floor(Math.min(...door.aperture.map(p => p.y)));
  const right = Math.ceil(Math.max(...door.aperture.map(p => p.x))), bottom = Math.ceil(Math.max(...door.aperture.map(p => p.y)));
  const sheet = new PNG({ width: width * 4, height: height * 2 });
  let closed: PNG | undefined;
  for (let i = 0; i < 8; i++) {
    // The passage replaces a closed door painted into the background. Generated
    // translucent interiors must cover that door, rather than reveal it again.
    const generated = PNG.sync.read(await sharp(file).flatten({ background: '#10120d' }).extract(sourceBox(door.id, i, metadata.width!, metadata.height!))
      .resize(right - left, bottom - top, { kernel: 'nearest' }).ensureAlpha().png().toBuffer());
    const frame = new PNG({ width, height });
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (pointInPolygon({ x: x + .5, y: y + .5 }, door.aperture)) {
      const useOriginal = i === 0 && door.id !== 'village-pub';
      const source = useOriginal ? original : generated;
      const offset = useOriginal ? (y * width + x) * 4 : ((y - top) * generated.width + x - left) * 4;
      source.data.copy(frame.data, (y * width + x) * 4, offset, offset + 4);
    }
    PNG.bitblt(frame, sheet, 0, 0, width, height, i % 4 * width, Math.floor(i / 4) * height);
    closed ??= frame;
  }
  const dir = new URL('art/objects/doors/', publicDir); await mkdir(dir, { recursive: true });
  await writeFile(new URL(`${door.id}.png`, dir), PNG.sync.write(closed!));
  await writeFile(new URL(`${door.id}-open.png`, dir), PNG.sync.write(sheet));
  console.log(`Packed ${door.id}: eight ${width} × ${height} registered frames`);
}
