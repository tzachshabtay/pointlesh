import sharp from 'sharp';

// Measured transparent gutters, not nominal quarter-sheet slices: the first
// pose slightly overlaps its nominal column and the row baselines differ.
const directory = new URL('../art-source/borin-side-walk/alternating-v3/', import.meta.url);
const spans = [
  [27, 390], [413, 766], [793, 1134], [1152, 1512],
  [23, 386], [413, 766], [793, 1139], [1152, 1513],
];
const source = new URL('source.png', directory).pathname;
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const scale = 100 / 442;
const layers = [];
for (const [frame, [first, last]] of spans.entries()) {
  const baseline = frame < 4 ? 513 : 987;
  const top = baseline - 448;
  let headLeft = last;
  let headRight = first;
  for (let y = baseline - 414; y < baseline - 390; y++) for (let x = first; x <= last; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 127) {
      headLeft = Math.min(headLeft, x);
      headRight = Math.max(headRight, x);
    }
  }
  const left = first - 2;
  const width = last - first + 5;
  const pixels = await sharp(source)
    .extract({ left, top, width, height: 453 })
    // A single scale for all poses preserves the leg motion and body size.
    .resize(Math.round(width * scale), Math.round(453 * scale), { kernel: 'nearest', fit: 'fill' })
    .png().toBuffer();
  layers.push({ input: pixels,
    left: (frame % 3) * 100 + 43 - Math.round(((headLeft + headRight) / 2 - left) * scale),
    top: Math.floor(frame / 3) * 140 + 120 - Math.round(448 * scale),
  });
}
const output = new URL('../public/art/borin.walk-left.alternating-v3.png', import.meta.url).pathname;
await sharp({ create: { width: 300, height: 420, channels: 4, background: '#00000000' } })
  .composite(layers).png().toFile(output);
console.log(output);
