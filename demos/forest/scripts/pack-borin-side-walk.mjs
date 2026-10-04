import sharp from 'sharp';

// Generated poses have uneven gutters. Extract their measured bounds rather
// than slicing through the boots at nominal eighths of the source image.
const source = new URL('../art-source/borin-side-walk/source.png', import.meta.url);
const output = new URL('../public/art/borin.walk-left.stride-v2.png', import.meta.url);
const spans = [[20, 273], [309, 550], [595, 820], [828, 1075],
  [1095, 1340], [1387, 1615], [1658, 1886], [1908, 2150]];
const { data, info } = await sharp(source.pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const scale = 100 / 422;
const layers = [];
for (const [frame, [first, last]] of spans.entries()) {
  // Register the helmet horizontally, independently of swinging arms/feet.
  let headLeft = last;
  let headRight = first;
  for (let y = 180; y < 210; y++) for (let x = first; x <= last; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 127) {
      headLeft = Math.min(headLeft, x);
      headRight = Math.max(headRight, x);
    }
  }
  const left = first - 2;
  const width = last - first + 5;
  const height = 470;
  const pixels = await sharp(source.pathname)
    .extract({ left, top: 128, width, height })
    // One common scale: never stretch individual poses to a bounding box.
    .resize(Math.round(width * scale), Math.round(height * scale), { kernel: 'nearest', fit: 'fill' })
    .png().toBuffer();
  layers.push({ input: pixels,
    left: (frame % 3) * 100 + 43 - Math.round(((headLeft + headRight) / 2 - left) * scale),
    top: Math.floor(frame / 3) * 140 + 120 - Math.round((573 - 128) * scale),
  });
}
await sharp({ create: { width: 300, height: 420, channels: 4, background: '#00000000' } })
  .composite(layers).png().toFile(output.pathname);
console.log(output.pathname);
