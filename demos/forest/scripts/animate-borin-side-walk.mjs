import sharp from 'sharp';
import assert from 'node:assert/strict';

const sourcePath = new URL('../public/art/borin.walk-left.promoted-1790377807996.png', import.meta.url).pathname;
const sourceFrames = await Promise.all(Array.from({ length: 8 }, (_, n) => sharp(sourcePath)
  .extract({ left: n % 3 * 100, top: Math.floor(n / 3) * 140, width: 100, height: 140 }).ensureAlpha().raw().toBuffer()));
const source = sourceFrames[0];
const W = 100, H = 140;
const bob = [0, 2, 0, -2, 0, 2, 0, -2];
// Ankle positions for one leg: stance moves back, then the bent knee swings
// the airborne foot forward. The other leg is four frames out of phase.
const ankle = [[45, 112], [49, 112], [54, 112], [61, 111], [62, 111], [61, 106], [54, 105], [45, 108]];
const bootAngle = [0, 0, 0, -0.12, -0.14, 0.15, 0.05, 0];
// Separate the projected legs most at passing, without widening the contact
// poses or making the two half-strides different lengths.
const trackWeight = [0, 0.5, 1, 0.5, 0, 0.5, 1, 0.5];
const bodyPose = [1, 3, 7, 0, 2, 5, 7, 0];
const frames = [];
const joints = [];

function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = polygon[i], [c, d] = polygon[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) result = !result;
  }
  return result;
}

function over(out, x, y, sx, sy, pixels = source) {
  sx = Math.round(sx); sy = Math.round(sy);
  if (x < 0 || x >= W || y < 0 || y >= H || sx < 0 || sx >= W || sy < 0 || sy >= H) return;
  const s = (sy * W + sx) * 4, t = (y * W + x) * 4;
  const a = pixels[s + 3] / 255, b = out[t + 3] / 255, alpha = a + b * (1 - a);
  if (!alpha) return;
  for (let c = 0; c < 3; c++) out[t + c] = Math.round((pixels[s + c] * a + out[t + c] * b * (1 - a)) / alpha);
  out[t + 3] = Math.round(alpha * 255);
}

function knee(hip, cuff, phase) {
  // The trouser leg ends at the cuff, not at the sole or ankle pivot. Solving
  // against the ankle folded the calf mesh when a raised boot passed the knee.
  const bend = [0, 1, 1, 1, 0, 2, 3, 2][phase];
  return [(hip[0] + cuff[0]) / 2 - bend, (hip[1] + cuff[1]) / 2];
}

const bootMask = [[39, 106], [53, 106], [54, 116], [51, 121], [29, 121], [29, 114], [36, 110]];
function boot(out, pivot, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = Math.floor(pivot[1] - 12); y < pivot[1] + 18; y++) for (let x = Math.floor(pivot[0] - 22); x < pivot[0] + 16; x++) {
    const dx = x - pivot[0], dy = y - pivot[1];
    const sx = 46 + dx * cos + dy * sin, sy = 112 - dx * sin + dy * cos;
    if (inside(sx, sy, bootMask)) over(out, x, y, sx, sy);
  }
}

// One connected piece of the original trousers and boot. Shared mesh edges
// keep the knee and ankle attached; independent clipped bone strips did not.
const legMask = [[38, 91], [62, 91], [58, 100], [54, 106], [54, 121], [29, 121], [29, 114], [36, 110], [39, 106], [39, 100]];
function triangle(out, original, target) {
  const [a, b, c] = target;
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const left = Math.max(0, Math.floor(Math.min(...target.map(p => p[0]))));
  const right = Math.min(W - 1, Math.ceil(Math.max(...target.map(p => p[0]))));
  const top = Math.max(0, Math.floor(Math.min(...target.map(p => p[1]))));
  const bottom = Math.min(H - 1, Math.ceil(Math.max(...target.map(p => p[1]))));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator;
    const w = 1 - u - v;
    if (Math.min(u, v, w) < -1e-8) continue;
    const sx = u * original[0][0] + v * original[1][0] + w * original[2][0];
    const sy = u * original[0][1] + v * original[1][1] + w * original[2][1];
    if (!inside(sx, sy, legMask)) continue;
    // The hidden hip overlap uses trouser pixels, not the tunic's gold hem.
    const s = (Math.max(95, Math.round(sy)) * W + Math.round(sx)) * 4;
    source.copy(out, (y * W + x) * 4, s, s + 4);
  }
}

function leg(out, hip, joint, foot, angle) {
  const pixels = Buffer.alloc(W * H * 4);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rows = [91, 100, 106, 121];
  const original = rows.map(y => [[25, y], [65, y]]);
  const target = rows.map((y, row) => [25, 65].map(x => {
    if (row === 0) return [hip[0] + x - 50, hip[1]];
    if (row === 1) return [joint[0] + x - 48, joint[1]];
    return [foot[0] + (x - 46) * cos - (y - 112) * sin, foot[1] + (x - 46) * sin + (y - 112) * cos];
  }));
  for (let row = 0; row < rows.length - 1; row++) {
    for (const indices of [[[row, 0], [row, 1], [row + 1, 0]], [[row, 1], [row + 1, 1], [row + 1, 0]]]) {
      triangle(pixels, indices.map(([r, c]) => original[r][c]), indices.map(([r, c]) => target[r][c]));
    }
  }
  // Check each leg before overlap with the other leg can conceal a gap.
  const start = Math.round(hip[1]) * W + Math.round(hip[0]);
  const end = Math.round(foot[1]) * W + Math.round(foot[0]);
  const connected = new Set([start]), queue = [start];
  assert(pixels[start * 4 + 3] > 127, 'Missing trouser pixels at the hip');
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], x = p % W, y = Math.floor(p / W);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const n = ny * W + nx;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || connected.has(n) || pixels[n * 4 + 3] <= 127) continue;
      connected.add(n); queue.push(n);
    }
  }
  assert(connected.has(end), 'The boot must be connected to its own trouser leg');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) over(out, x, y, x, y, pixels);
}

// Lock the stance sole to the ground, not the whole sprite's bounding box.
// This preserves the intentionally different head heights across the cycle.
for (let phase = 0; phase <= 4; phase++) {
  const pixels = Buffer.alloc(W * H * 4);
  boot(pixels, ankle[phase], bootAngle[phase]);
  let bottom = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pixels[(y * W + x) * 4 + 3] > 127) bottom = y;
  ankle[phase][1] += 120 - bottom;
}

for (let frame = 0; frame < 8; frame++) {
  const out = Buffer.alloc(W * H * 4);
  const record = { frame, bob: bob[frame], legs: [] };
  for (const [name, phase, hipX, trackX, trackY] of [['far', (frame + 4) % 8, 57, 4, -1], ['near', frame, 48, -4, 0]]) {
    const hip = [hipX, 91 + bob[frame]];
    // At passing, show the raised near foot in front of the support leg and
    // the raised far foot behind it, matching the sprite's three-quarter view.
    const passingX = name === 'far' ? 9 : -7;
    const foot = [ankle[phase][0] + (phase === 6 ? passingX : trackX * trackWeight[phase]), ankle[phase][1] + trackY];
    const cuff = [foot[0] + 6 * Math.sin(bootAngle[phase]), foot[1] - 6 * Math.cos(bootAngle[phase])];
    const joint = knee(hip, cuff, phase);
    assert(hip[1] < joint[1] && joint[1] < cuff[1], 'Trouser mesh must not fold back above the knee');
    leg(out, hip, joint, foot, bootAngle[phase]);
    record.legs.push({ name, phase, hip, knee: joint, ankle: foot });
  }
  // Reuse the original arm poses, registering the helmet so differences in
  // source padding do not become a horizontal wobble or erase the body bob.
  const upper = sourceFrames[bodyPose[frame]];
  let headTop = 140, headLeft = 100, headRight = 0;
  for (let y = 0; y < 34; y++) for (let x = 0; x < W; x++) if (upper[(y * W + x) * 4 + 3] > 127) {
    headTop = Math.min(headTop, y); headLeft = Math.min(headLeft, x); headRight = Math.max(headRight, x);
  }
  const offsetX = 44 - Math.round((headLeft + headRight) / 2);
  const offsetY = 21 - headTop + bob[frame];
  for (let y = 0; y < 96; y++) for (let x = 0; x < W; x++) over(out, x + offsetX, y + offsetY, x, y, upper);
  frames.push(out);
  joints.push(record);
}

// Pack raw rows rather than compositing encoded PNG layers. This avoids an
// extra premultiply/unpremultiply round trip changing semitransparent RGBs.
const packed = Buffer.alloc(W * 3 * H * 3 * 4);
for (const [index, frame] of frames.entries()) for (let y = 0; y < H; y++) {
  frame.copy(packed, ((Math.floor(index / 3) * H + y) * W * 3 + index % 3 * W) * 4, y * W * 4, (y + 1) * W * 4);
}
const output = new URL('../public/art/borin.walk-left.manual-v6.png', import.meta.url).pathname;
await sharp(packed, { raw: { width: W * 3, height: H * 3, channels: 4 } }).png().toFile(output);
console.log(output);
if (process.argv.includes('--joints')) console.log(JSON.stringify(joints, null, 2));
