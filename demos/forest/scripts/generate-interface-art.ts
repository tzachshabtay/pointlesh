import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { assertManifest } from '@ai-game-assets/core';
import { addForestInterfaceAssets, interfaceAssetDefinitions } from '../src/interface-assets.js';

const size = 32, outline = '#252c27', cream = '#f4e2b4', gold = '#dcb363', copper = '#b77645', shadow = '#68452e', green = '#527666';
type Image = { width: number; height: number; data: Uint8Array };
function art(id: string): Image {
  const image = { width: size, height: size, data: new Uint8Array(size * size * 4) };
  const pixel = (x: number, y: number, color: string) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const value = parseInt(color.slice(1), 16);
    image.data.set([value >> 16, value >> 8 & 255, value & 255, 255], (y * size + x) * 4);
  };
  const rect = (x: number, y: number, w: number, h: number, color: string) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pixel(xx, yy, color); };
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string, hollow = false) => {
    for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
      const d = xx * xx / (rx * rx) + yy * yy / (ry * ry);
      if (d <= 1 && (!hollow || d > .55)) pixel(x + xx, y + yy, color);
    }
  };
  const line = (x: number, y: number, xx: number, yy: number, color: string, width = 1) => {
    const steps = Math.max(Math.abs(xx - x), Math.abs(yy - y));
    for (let i = 0; i <= steps; i++) rect(Math.round(x + (xx - x) * i / steps), Math.round(y + (yy - y) * i / steps), width, width, color);
  };
  if (id === 'cursor.walk') {
    for (const [x, y] of [[10, 19], [21, 11]]) {
      ellipse(x, y, 4, 6, gold); rect(x - 3, y + 7, 7, 3, copper);
      line(x - 2, y - 3, x - 2, y + 2, cream); line(x - 2, y + 3, x + 2, y + 3, shadow);
    }
  } else if (id === 'cursor.interact') {
    rect(12, 5, 4, 15, cream); rect(16, 11, 3, 11, gold); rect(19, 13, 3, 10, cream); rect(22, 16, 3, 7, gold);
    rect(11, 17, 12, 8, gold); line(8, 15, 12, 21, cream, 3); rect(12, 25, 10, 4, green); rect(13, 25, 8, 1, cream);
    line(15, 11, 15, 17, copper); line(18, 14, 18, 19, copper); line(21, 16, 21, 20, copper);
  } else if (id === 'inventory.coin') {
    ellipse(16, 17, 10, 10, shadow); ellipse(16, 15, 10, 10, copper); ellipse(16, 15, 8, 8, gold); ellipse(16, 15, 6, 6, copper, true);
    line(16, 9, 16, 20, cream, 2); line(12, 15, 19, 15, cream); line(10, 8, 14, 6, cream);
  } else if (id === 'inventory.rope') {
    ellipse(15, 15, 11, 9, shadow, true); ellipse(15, 14, 10, 8, gold, true); ellipse(15, 14, 7, 5, copper, true); ellipse(15, 14, 5, 3, cream, true);
    line(22, 18, 22, 25, gold, 2); line(22, 25, 27, 27, copper, 2);
    rect(9, 9, 3, 14, shadow); rect(10, 9, 2, 14, cream); rect(8, 14, 5, 3, copper);
    for (const x of [5, 15, 22]) line(x, 9, x + 2, 11, cream);
  } else if (id === 'inventory.mushroom') {
    rect(13, 15, 6, 12, '#e8d2a3'); rect(17, 17, 3, 9, '#b8a985'); rect(11, 26, 11, 2, gold);
    ellipse(16, 14, 12, 7, '#58395e'); ellipse(16, 12, 10, 7, '#9868a0'); rect(5, 15, 23, 3, '#805080');
    rect(11, 9, 3, 3, cream); rect(20, 11, 3, 2, cream); rect(15, 5, 2, 2, cream); rect(8, 14, 2, 2, cream);
  } else if (id === 'inventory.pickaxe') {
    line(8, 26, 23, 8, shadow, 3); line(8, 25, 23, 7, copper, 2); line(11, 23, 18, 15, gold);
    line(6, 11, 15, 5, '#829a98', 3); line(15, 5, 25, 8, '#bdc9b5', 3); line(25, 8, 28, 15, '#829a98', 2);
    line(7, 11, 16, 5, cream); line(17, 5, 24, 7, cream); rect(17, 7, 5, 4, shadow); rect(18, 7, 3, 4, gold);
  } else {
    ellipse(25, 18, 4, 7, shadow, true); ellipse(25, 17, 3, 5, gold, true);
    rect(7, 10, 17, 17, shadow); rect(8, 10, 14, 16, copper); rect(10, 12, 3, 13, gold); rect(17, 12, 2, 13, '#8e5d35');
    rect(7, 23, 16, 3, '#8b9990'); rect(8, 23, 12, 1, cream); ellipse(15, 9, 9, 4, cream);
    ellipse(10, 7, 3, 3, cream); ellipse(17, 6, 4, 3, cream); rect(20, 9, 3, 6, cream);
    if (id === 'inventory.sleepyStout') { ellipse(15, 17, 4, 4, '#76577f'); line(15, 14, 15, 20, '#c8a6dc'); line(12, 17, 18, 17, '#c8a6dc'); rect(24, 4, 2, 2, '#c8a6dc'); }
    else { ellipse(15, 17, 4, 4, shadow); line(15, 14, 15, 19, gold); line(12, 16, 17, 16, gold); }
  }
  const copy = image.data.slice();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!copy[(y * size + x) * 4 + 3] && [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([xx,yy]) => xx >= 0 && yy >= 0 && xx < size && yy < size && copy[(yy * size + xx) * 4 + 3])) pixel(x,y,outline);
  return image;
}
function animation(base: Image): Image {
  const sheet = { width: size * 6, height: size, data: new Uint8Array(size * size * 6 * 4) };
  for (let frame = 0; frame < 6; frame++) {
    const dy = [1, 2, -2, -1, 0, 0][frame];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sourceY = frame === 1 ? Math.round((y - 16) / .9 + 16 - dy) : y - dy;
      if (sourceY >= 0 && sourceY < size) sheet.data.set(base.data.subarray((sourceY * size + x) * 4, (sourceY * size + x) * 4 + 4), (y * sheet.width + frame * size + x) * 4);
    }
    if (frame === 2 || frame === 3) for (const [x,y] of [[26,3],[25,4],[26,4],[27,4],[26,5]]) sheet.data.set([255,236,164,255], (y * sheet.width + frame * size + x) * 4);
  }
  return sheet;
}
function png(image: Image): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length); body.copy(output, 4); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4); return output;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(image.width); header.writeUInt32BE(image.height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let row = 0; row < image.height; row++) rows.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), row * (image.width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const directory = new URL('../public/art/interface/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const id of Object.keys(interfaceAssetDefinitions).filter(id => !id.endsWith('.click'))) {
  const base = art(id); await writeFile(new URL(`${id}.png`, directory), png(base)); await writeFile(new URL(`${id}.click.png`, directory), png(animation(base)));
}
if (process.argv.includes('--promote')) {
  const file = new URL('../public/authoring/assets.json', import.meta.url);
  const manifest = addForestInterfaceAssets(JSON.parse(await readFile(file, 'utf8'))); assertManifest(manifest);
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
}
console.log('Wrote eight interface images and their six-frame click animations.');
