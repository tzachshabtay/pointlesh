// Texture import only: keep generated poses intact, use one scale per sheet,
// and place each frame on the base image's foot pivot before packing the atlas.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import sharp from 'sharp';

function bounds(image, fromY = 0) {
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = fromY; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Empty generated frame');
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}
const inputs = process.argv.slice(2);
if (inputs.length !== 3) throw new Error('Usage: node pack-guard-patrol-art.mjs FACE_BACK.png FACE_BACK_LEFT.png DRINK.png');
const directory = new URL('../public/art/characters/guard/', import.meta.url);
await mkdir(directory, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('../public/authoring/assets.json', import.meta.url), 'utf8'));
const guard = manifest.assets.guard;
const base = PNG.sync.read(await readFile(new URL('../public/' + guard.versions[guard.activeVersion].file, import.meta.url)));
if (base.width !== 40 || base.height !== 80) throw new Error('This import targets the promoted 40 × 80 guard; update the animation definitions before importing another frame size.');
const baseBounds = bounds(base), baseFeet = bounds(base, Math.max(0, baseBounds.bottom - 4));
const pivotX = (baseFeet.left + baseFeet.right) / 2, pivotY = baseBounds.bottom;
const names = ['face-back', 'face-back-left', 'drink'];
for (const [index, input] of inputs.entries()) {
  const source = PNG.sync.read(await readFile(input));
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const left = Math.round((i % 4) * source.width / 4), top = Math.round(Math.floor(i / 4) * source.height / 2);
    const right = Math.round((i % 4 + 1) * source.width / 4), bottom = Math.round((Math.floor(i / 4) + 1) * source.height / 2);
    const frame = new PNG({ width: right - left, height: bottom - top });
    PNG.bitblt(source, frame, left, top, frame.width, frame.height, 0, 0);
    const ink = bounds(frame), feet = bounds(frame, Math.max(0, ink.bottom - Math.round(ink.height * .04)));
    frames.push({ image: frame, ink, footX: (feet.left + feet.right) / 2 });
  }
  const scale = Math.min(baseBounds.height / Math.max(...frames.map(frame => frame.ink.height)),
    ...frames.map(frame => (pivotX - 1) / (frame.footX - frame.ink.left + 1)),
    ...frames.map(frame => (base.width - pivotX - 2) / (frame.ink.right - frame.footX + 1)));
  const sheet = new PNG({ width: base.width * 4, height: base.height * 2 });
  for (const [i, frame] of frames.entries()) {
    const { ink } = frame;
    const width = Math.max(1, Math.round(ink.width * scale)), height = Math.max(1, Math.round(ink.height * scale));
    const resized = PNG.sync.read(await sharp(PNG.sync.write(frame.image)).extract({ left: ink.left, top: ink.top, width: ink.width, height: ink.height })
      .resize(width, height, { kernel: 'nearest', fit: 'fill' }).png().toBuffer());
    const x = Math.round(pivotX - (frame.footX - ink.left) * width / ink.width), y = pivotY - height + 1;
    if (x < 0 || y < 0 || x + width > base.width || y + height > base.height) throw new Error(`Frame ${i} does not fit; refusing to crop`);
    PNG.bitblt(resized, sheet, 0, 0, width, height, i % 4 * base.width + x, Math.floor(i / 4) * base.height + y);
  }
  await writeFile(new URL(names[index] + '.png', directory), PNG.sync.write(sheet));
  if (index === 0) {
    // A matching back-idle cycle, using the two fully back-facing generated poses.
    // Keep the authored idle-back asset's existing 3×3, eight-frame geometry.
    const idle = new PNG({ width: base.width * 3, height: base.height * 3 });
    for (let i = 0; i < 8; i++) {
      const sourceFrame = i < 4 ? 6 : 7;
      PNG.bitblt(sheet, idle, sourceFrame % 4 * base.width, Math.floor(sourceFrame / 4) * base.height, base.width, base.height, i % 3 * base.width, Math.floor(i / 3) * base.height);
    }
    await writeFile(new URL('patrol-idle-back.png', directory), PNG.sync.write(idle));
  }
  console.log(`${names[index]}: ${sheet.width}×${sheet.height}, uniform scale ${scale.toFixed(4)}, foot baseline ${pivotY}`);
}
