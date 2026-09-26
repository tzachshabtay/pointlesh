// Import generated art with one scale per animation and stable feet/hinge anchors.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const [boundFile, tieFile, pickaxeFile, doorFile, cleanFile] = process.argv.slice(2);
if (!cleanFile) throw new Error('Usage: pack-rescue-actions.mjs BOUND TIE PICKAXE DOOR_ANIMATION CLEAN_CAMP');
const publicDir = new URL('../public/', import.meta.url);
const ink = (png, x, y) => png.data[(y * png.width + x) * 4 + 3] > 16;
function bounds(png, left = 0, top = 0, right = png.width, bottom = png.height) {
  let x0 = right, y0 = bottom, x1 = left, y1 = top;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (ink(png, x, y)) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x0 > x1 || y0 > y1) throw new Error('Empty animation cell');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
async function write(relative, png) {
  const path = new URL(relative, publicDir);
  await mkdir(new URL('.', path), { recursive: true });
  await writeFile(path, PNG.sync.write(png));
}
async function stamp(sheet, file, box, scale, left, top) {
  const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
  if (left < 0 || top < 0 || left + width > sheet.width || top + height > sheet.height) throw new Error(`Imported pose clips its canvas: ${JSON.stringify({left,top,width,height,box})}`);
  const image = PNG.sync.read(await sharp(file).extract(box).resize(width, height, { kernel: 'nearest' }).png().toBuffer());
  PNG.bitblt(image, sheet, 0, 0, width, height, left, top);
}
async function character(file, name) {
  const source = PNG.sync.read(await readFile(file));
  const cells = Array.from({ length: 8 }, (_, i) => bounds(source,
    Math.round(i % 4 * source.width / 4), i < 4 ? 0 : 449,
    Math.round((i % 4 + 1) * source.width / 4), i < 4 ? 449 : source.height));
  const scale = 100 / cells[0].height;
  const sheet = new PNG({ width: 800, height: 400 });
  for (const [i, box] of cells.entries()) {
    const feet = bounds(source, box.left, box.top + box.height - 12, box.left + box.width, box.top + box.height);
    const anchorX = feet.left + feet.width / 2;
    await stamp(sheet, file, box, scale, i % 4 * 200 + Math.round(100 - (anchorX - box.left) * scale),
      Math.floor(i / 4) * 200 + 180 - Math.round(box.height * scale));
  }
  await write(`art/characters/borin/${name}.png`, sheet);
  return { name, scale, cells };
}
const bound = PNG.sync.read(await readFile(boundFile)), boundBox = bounds(bound);
const boundCanvas = new PNG({ width: 240, height: 200 });
const boundScale = 193 / boundBox.width;
await stamp(boundCanvas, boundFile, boundBox, boundScale, 24, 196 - Math.round(boundBox.height * boundScale));
await write('art/characters/guard/bound.png', boundCanvas);
const characters = [await character(tieFile, 'tie-rope-back'), await character(pickaxeFile, 'pickaxe-back')];

const door = PNG.sync.read(await readFile(doorFile));
const splits = [439, 439, 440, 451];
const boxes = Array.from({ length: 8 }, (_, i) => bounds(door,
  Math.round(i % 4 * door.width / 4), i < 4 ? 0 : splits[i % 4],
  Math.round((i % 4 + 1) * door.width / 4), i < 4 ? splits[i % 4] : door.height));
const scale = 180 / boxes[0].height;
// The artist supplied different margins around each pose. Align the hinge post,
// not the visible bounding box (which moves left as the leaf swings outward).
const hingeFractions = [.04, .035, .03, .065, .065, .32, .925, .93];
const sheet = new PNG({ width: 960, height: 460 });
for (const [i, box] of boxes.entries()) {
  const hingeX = Math.round(box.left + box.width * hingeFractions[i]);
  const hingeBox = bounds(door, hingeX - 3, box.top, hingeX + 4, box.top + box.height);
  const hingeBottom = hingeBox.top + hingeBox.height;
  await stamp(sheet, doorFile, box, scale, i % 4 * 240 + Math.round(120 - (hingeX - box.left) * scale),
    Math.floor(i / 4) * 230 + 205 - Math.round((hingeBottom - box.top) * scale));
}
await write('art/objects/cage-door-open.png', sheet);
const closed = new PNG({ width: 240, height: 230 });
PNG.bitblt(sheet, closed, 0, 0, 240, 230, 0, 0);
await write('art/objects/cage-door.png', closed);

// Only the door-sized patch comes from the generated clean plate. Every pixel
// outside it remains the original room, including the stationary cage walls.
const original = await sharp(new URL('art/atlas-mine-camp.png', publicDir).pathname)
  .extract({ left: 0, top: 666, width: 1182, height: 664 }).png().toBuffer();
const patch = { left: 760, top: 221, width: 105, height: 186 };
const clean = await sharp(cleanFile).resize(1182, 664, { kernel: 'nearest' }).png().toBuffer();
const patchImage = await sharp(clean).extract(patch).png().toBuffer();
await sharp(original).composite([{ input: patchImage, left: patch.left, top: patch.top }]).png()
  .toFile(new URL('art/camp-doorless.png', publicDir).pathname);
console.log(JSON.stringify({ characters, door: { boxes, scale, hingeFractions }, patch }));
