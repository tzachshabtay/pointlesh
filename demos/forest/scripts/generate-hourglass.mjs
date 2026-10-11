import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';

// Match the demo's authored 32px interface icons. Bake the motion into an editable sheet.
const size = 32, count = 20;
const sheet = new PNG({ width: size * count, height: size });
for (let frame = 0; frame < count; frame++) {
  const icon = new PNG({ width: size, height: size });
  const pixel = (x, y, color, alpha = 255) => {
    const n = parseInt(color, 16), offset = (y * size + x) * 4;
    icon.data.set([n >> 16, n >> 8 & 255, n & 255, alpha], offset);
  };
  const rect = (x, y, width, height, color) => {
    for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) pixel(xx, yy, color);
  };
  const progress = Math.min(1, frame / 11);
  for (let y = 8; y <= 23; y++) {
    const half = Math.max(1, Math.floor(Math.abs(y - 15.5) * .8));
    for (let x = 15 - half; x <= 16 + half; x++) {
      pixel(x, y, x === 15 - half || x === 16 + half ? '7faaa6' : '83b4b4', 180);
      if (x > 15 - half && x < 16 + half && ((y < 15 && y >= 8 + Math.round(progress * 7)) ||
        (y > 16 && y >= 24 - Math.round(progress * 7) + Math.floor(Math.abs(x - 15.5) / 2)))) pixel(x, y, 'dcb363');
    }
  }
  if (progress < 1) for (let y = 15; y < 23 - Math.round(progress * 5); y++) pixel(15 + ((y + frame) % 3 === 0 ? 1 : 0), y, 'f4e2b4');
  for (const x of [7, 23]) { rect(x, 7, 2, 18, '68452e'); rect(x, 8, 1, 16, 'b77645'); }
  for (const y of [5, 25]) {
    rect(6, y, 20, 3, '68452e'); rect(7, y, 18, 2, 'b77645'); rect(8, y, 16, 1, 'e5bb76');
  }
  // Inverse nearest-neighbor sampling keeps the flip solid, without holes.
  const angle = frame < 12 ? 0 : (frame - 11) * Math.PI / 9;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - 15.5, dy = y - 15.5;
    const sx = Math.round(15.5 + dx * Math.cos(angle) + dy * Math.sin(angle));
    const sy = Math.round(15.5 - dx * Math.sin(angle) + dy * Math.cos(angle));
    if (sx >= 0 && sx < size && sy >= 0 && sy < size)
      sheet.data.set(icon.data.subarray((sy * size + sx) * 4, (sy * size + sx) * 4 + 4), (y * sheet.width + frame * size + x) * 4);
  }
}
const base = new PNG({ width: size, height: size });
PNG.bitblt(sheet, base, 0, 0, size, size, 0, 0);
await writeFile(new URL('../public/art/interface/cursor.busy.png', import.meta.url), PNG.sync.write(base));
await writeFile(new URL('../public/art/interface/cursor.busy.idle.png', import.meta.url), PNG.sync.write(sheet));
