import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../public/art/borin.walk-left.promoted-1790377807996.png', import.meta.url).pathname;
const sourceFrames = await Promise.all(Array.from({ length: 8 }, (_, n) => sharp(sourcePath)
  .extract({ left: n % 3 * 100, top: Math.floor(n / 3) * 140, width: 100, height: 140 }).ensureAlpha().raw().toBuffer()));
const source = sourceFrames[0];
const W = 100, H = 140;
const version = 'manual-v8';
const phases = ['Contact', 'Recoil', 'Passing', 'High point'];
const bob = [0, 2, 0, -2, 0, 2, 0, -2];
// The reference's gray limbs are the near limbs. Frames 1–4 support on the
// near leg while its arm swings back-to-front; frames 5–8 exchange the roles.
// Foot angles express heel contact, flat support, toe-off and a hanging foot.
const ankle = [[43, 110], [46, 112], [54, 112], [62, 108], [65, 106], [67, 96], [51, 97], [43, 102]];
const bootAngle = [0.28, 0, 0, -0.2, -0.42, -1.05, -0.85, -0.5];
const kneePose = [[45, 101], [43, 103], [52, 102], [58, 98], [61, 96], [63, 101], [41, 98], [38, 97]];
const nearArm = [
  [[61, 56], [73, 69], [73, 81]],
  [[61, 56], [70, 73], [72, 84]],
  [[61, 56], [63, 76], [57, 86]],
  [[61, 56], [49, 74], [37, 67]],
  [[61, 56], [44, 73], [33, 63]],
  [[61, 56], [47, 75], [38, 68]],
  [[61, 56], [56, 76], [59, 87]],
  [[61, 56], [72, 73], [73, 84]],
];
const farArm = [
  [[45, 58], [30, 72], [21, 64]],
  [[45, 58], [31, 75], [23, 68]],
  [[45, 58], [36, 76], [40, 86]],
  [[48, 58], [72, 72], [77, 83]],
  [[48, 58], [74, 69], [79, 81]],
  [[48, 58], [72, 73], [78, 85]],
  [[45, 58], [43, 76], [42, 86]],
  [[45, 58], [32, 73], [23, 67]],
];
// Trace the retained torso's hem; the original arms and legs are replaced.
function hemY(x) {
  const points = [[0, 95], [37, 97], [42, 97], [50, 94], [59, 94], [65, 96], [70, 96], [100, 96]];
  const index = points.findIndex(p => p[0] > x);
  const [a, b] = [points[index - 1], points[index]];
  return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}
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

const bootMask = [[39, 106], [53, 106], [54, 116], [51, 121], [29, 121], [29, 114], [36, 110]];
function boot(out, pivot, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - pivot[0], dy = y - pivot[1];
    const sx = 46 + dx * cos + dy * sin, sy = 112 - dx * sin + dy * cos;
    if (inside(sx, sy, bootMask)) over(out, x, y, sx, sy);
  }
}

// One connected piece of the original trousers and boot. Shared mesh edges
// keep the knee and ankle attached; independent clipped bone strips did not.
const legMask = [[38, 91], [62, 91], [58, 100], [54, 106], [54, 121], [29, 121], [29, 114], [36, 110], [39, 106], [39, 100]];
function triangle(out, original, target, mask = legMask, trouser = true) {
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
    if (!inside(Math.round(sx), Math.round(sy), mask)) continue;
    // The hidden hip overlap uses trouser pixels, not the tunic's gold hem.
    const s = ((trouser ? Math.max(95, Math.round(sy)) : Math.round(sy)) * W + Math.round(sx)) * 4;
    if (source[s + 3] >= out[(y * W + x) * 4 + 3]) source.copy(out, (y * W + x) * 4, s, s + 4);
  }
}

function unit(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  return [dx / length, dy / length];
}
function normal(from, to) { const [x, y] = unit(from, to); return [y, -x]; }
function jointNormal(a, b, c) {
  const u = normal(a, b), v = normal(b, c), length = Math.hypot(u[0] + v[0], u[1] + v[1]);
  const sign = u[0] + v[0] < 0 ? -1 : 1;
  return [sign * (u[0] + v[0]) / length, sign * (u[1] + v[1]) / length];
}
function ribbon(pixels, original, target, mask, trouser) {
  for (let row = 0; row < original.length - 1; row++) {
    for (const indices of [[[row, 0], [row, 1], [row + 1, 0]], [[row, 1], [row + 1, 1], [row + 1, 0]]]) {
      triangle(pixels, indices.map(([r, c]) => original[r][c]), indices.map(([r, c]) => target[r][c]), mask, trouser);
    }
  }
}

function assertConnected(pixels, from, to, label) {
  const start = Math.round(from[1]) * W + Math.round(from[0]);
  const end = Math.round(to[1]) * W + Math.round(to[0]);
  const connected = new Set([start]), queue = [start];
  assert(pixels[start * 4 + 3] > 127, `${label}: missing attachment pixels`);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], x = p % W, y = Math.floor(p / W);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const n = ny * W + nx;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || connected.has(n) || pixels[n * 4 + 3] <= 127) continue;
      connected.add(n); queue.push(n);
    }
  }
  assert(connected.has(end), `${label}: disconnected limb`);
}

const armMask = [[55, 48], [66, 46], [73, 53], [77, 63], [76, 78], [73, 89], [66, 93], [60, 91], [59, 83], [59, 72], [53, 65], [50, 56]];
function arm(out, shoulder, elbow, wrist, scale = 1) {
  const pixels = Buffer.alloc(W * H * 4);
  const upper = unit(shoulder, elbow), lower = unit(elbow, wrist);
  const centers = [[shoulder[0] - upper[0] * 8 * scale, shoulder[1] - upper[1] * 8 * scale], shoulder, elbow, wrist, [wrist[0] + lower[0] * 9 * scale, wrist[1] + lower[1] * 9 * scale]];
  const normals = [normal(shoulder, elbow), normal(shoulder, elbow), jointNormal(shoulder, elbow, wrist), normal(elbow, wrist), normal(elbow, wrist)];
  const rows = [48, 56, 71, 84, 93], sourceX = [60, 60, 65, 65, 65];
  const original = rows.map(y => [[45, y], [80, y]]);
  const target = rows.map((_, row) => [45, 80].map(x => [centers[row][0] + normals[row][0] * (x - sourceX[row]) * scale, centers[row][1] + normals[row][1] * (x - sourceX[row]) * scale]));
  ribbon(pixels, original, target, armMask, false);
  assertConnected(pixels, shoulder, wrist, 'Shoulder to wrist');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) over(out, x, y, x, y, pixels);
}

function leg(out, hip, joint, foot, angle) {
  const pixels = Buffer.alloc(W * H * 4);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rows = [91, 100, 106, 121];
  const original = rows.map(y => [[25, y], [65, y]]);
  const cuff = [foot[0] + 6 * sin, foot[1] - 6 * cos];
  const kneeNormal = jointNormal(hip, joint, cuff);
  const target = rows.map((y, row) => [25, 65].map(x => {
    if (row === 0) return [hip[0] + x - 50, hip[1]];
    if (row === 1) return [joint[0] + (x - 48) * kneeNormal[0], joint[1] + (x - 48) * kneeNormal[1]];
    return [foot[0] + (x - 46) * cos - (y - 112) * sin, foot[1] + (x - 46) * sin + (y - 112) * cos];
  }));
  for (let row = 0; row < 2; row++) {
    // A folded calf is hidden inside the tall boot cuff. Do not stretch its
    // texture back across the boot or it reads as a thin detached strip.
    if (row === 1 && joint[1] >= cuff[1]) continue;
    for (const indices of [[[row, 0], [row, 1], [row + 1, 0]], [[row, 1], [row + 1, 1], [row + 1, 0]]]) {
      triangle(pixels, indices.map(([r, c]) => original[r][c]), indices.map(([r, c]) => target[r][c]));
    }
  }
  const inLimb = (x, y, a, b, startRadius, endRadius) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) <= startRadius + (endRadius - startRadius) * t;
  };
  // Keep the trouser silhouette round at deep bends, where a wide mesh edge
  // otherwise produces a sharp triangular flap outside the knee.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inLimb(x, y, hip, joint, 11, 6) && !inLimb(x, y, joint, cuff, 6, 7)) pixels[(y * W + x) * 4 + 3] = 0;
  }
  // Restore the round trouser knee across tightly folded ribbon bands.
  for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) {
    if (dx * dx / 36 + dy * dy / 25 <= 1) over(pixels, Math.round(joint[0]) + dx, Math.round(joint[1]) + dy, 48 + dx * 0.8, 100 + dy * 0.6);
  }
  boot(pixels, foot, angle);
  // Check each leg before overlap with the other leg can conceal a gap.
  assertConnected(pixels, hip, foot, 'Hip to boot');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) over(out, x, y, x, y, pixels);
}

// Lock the stance sole to the ground, not the whole sprite's bounding box.
// This preserves the intentionally different head heights across the cycle.
for (let phase = 0; phase < 8; phase++) {
  const pixels = Buffer.alloc(W * H * 4);
  boot(pixels, ankle[phase], bootAngle[phase]);
  let bottom = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pixels[(y * W + x) * 4 + 3] > 127) bottom = y;
  ankle[phase][1] += [120, 120, 120, 120, 120, 115, 113, 115][phase] - bottom;
}

for (let frame = 0; frame < 8; frame++) {
  const out = Buffer.alloc(W * H * 4);
  const shiftedArm = points => points.map(([x, y]) => [x, y + bob[frame]]);
  arm(out, ...shiftedArm(farArm[frame]), 0.78);
  // A single waistband sits beneath the entire tunic and both articulated
  // thighs. It moves with the body, so no transparent slit can open at a hip.
  const waist = [[39, 85], [65, 85], [70, 92], [68, 97], [61, 100], [44, 100], [36, 95], [36, 90]];
  for (let y = 85; y <= 100; y++) for (let x = 36; x <= 70; x++) {
    if (inside(x, y, waist)) over(out, x, y + bob[frame], 40 + (x - 36) * 28 / 34, 95 + Math.max(0, y - 91) * 0.5);
  }
  const record = { frame: frame + 1, phase: phases[frame % 4], bob: bob[frame], nearArm: shiftedArm(nearArm[frame]), farArm: shiftedArm(farArm[frame]), legs: [] };
  for (const [name, phase, hipX, trackY] of [['far', (frame + 4) % 8, 48, -1], ['near', frame, 54, 0]]) {
    const hip = [hipX, 91 + bob[frame]];
    // Show the raised far knee ahead of the support shin in the passing pose.
    const projectionX = name === 'far' && phase === 6 ? -7 : 0;
    const foot = [ankle[phase][0] + projectionX, ankle[phase][1] + trackY];
    const joint = [kneePose[phase][0] + projectionX, kneePose[phase][1] + bob[frame] * 0.5 + trackY];
    leg(out, hip, joint, foot, bootAngle[phase]);
    record.legs.push({ name, phase: phase + 1, hip, knee: joint, ankle: foot, bootAngle: bootAngle[phase] });
  }
  // Keep the original face and body colors while the separately articulated
  // arms follow the reference rather than the original sheet's arm poses.
  const upper = sourceFrames[0];
  let headTop = 140, headLeft = 100, headRight = 0;
  for (let y = 0; y < 34; y++) for (let x = 0; x < W; x++) if (upper[(y * W + x) * 4 + 3] > 127) {
    headTop = Math.min(headTop, y); headLeft = Math.min(headLeft, x); headRight = Math.max(headRight, x);
  }
  const offsetX = 44 - Math.round((headLeft + headRight) / 2);
  const offsetY = 21 - headTop + bob[frame];
  const torsoMask = [[33, 62], [59, 52], [68, 62], [71, 89], [69, 95], [42, 98], [29, 95]];
  const foundation = [[48, 47], [62, 44], [72, 49], [70, 91], [66, 96], [40, 96], [34, 70]];
  for (let y = 44; y < 97; y++) for (let x = 34; x < 71; x++) if (inside(x, y, foundation)) {
    if (y < 65) over(out, x + offsetX, y + offsetY, 54 + (x - 48) * 0.25, 53 + (y - 44) * 0.4);
    else over(out, x + offsetX, y + offsetY, 63 + (x - 58) * 5 / 13, 82 + (y - 65) * 10 / 31, sourceFrames[2]);
  }
  for (let y = 0; y < 98; y++) for (let x = 0; x < W; x++) {
    if (y >= 62 && !inside(x, y, torsoMask)) continue;
    if (y >= hemY(x)) continue;
    if (y >= 62 && x >= 58) {
      // Borrow the unobstructed back of the tunic from the original arm-forward
      // pose, instead of leaving the original hanging arm baked into the body.
      over(out, x + offsetX, y + offsetY, 63 + (x - 58) * 5 / 13, 80 + (y - 62) * 13 / 34, sourceFrames[2]);
    } else if (y < 62 && x > 55 && inside(x, y, armMask)) {
      continue;
    } else over(out, x + offsetX, y + offsetY, x, y, upper);
  }
  arm(out, ...shiftedArm(nearArm[frame]));
  frames.push(out);
  joints.push(record);
}

// Pack raw rows rather than compositing encoded PNG layers. This avoids an
// extra premultiply/unpremultiply round trip changing semitransparent RGBs.
const packed = Buffer.alloc(W * 3 * H * 3 * 4);
for (const [index, frame] of frames.entries()) for (let y = 0; y < H; y++) {
  frame.copy(packed, ((Math.floor(index / 3) * H + y) * W * 3 + index % 3 * W) * 4, y * W * 4, (y + 1) * W * 4);
}
const output = new URL(`../public/art/borin.walk-left.${version}.png`, import.meta.url).pathname;
await sharp(packed, { raw: { width: W * 3, height: H * 3, channels: 4 } }).png().toFile(output);
console.log(output);
if (process.argv.includes('--joints')) console.log(JSON.stringify(joints, null, 2));

// Review the actual packed frame cells without individual auto-cropping or
// alignment, so frame numbers, waist joins and the body bob are inspectable.
if (process.argv.includes('--review')) {
  const directory = new URL(`../art-source/borin-side-walk/${version}/`, import.meta.url).pathname;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}poses.json`, JSON.stringify(joints, null, 2) + '\n');
  const cards = [];
  for (let index = 0; index < frames.length; index++) {
    const sprite = await sharp(frames[index], { raw: { width: W, height: H, channels: 4 } })
      .resize(300, 420, { kernel: 'nearest' }).png().toBuffer();
    const label = Buffer.from(`<svg width="320" height="460"><text x="160" y="28" text-anchor="middle" font-family="sans-serif" font-size="20" fill="white">Frame ${index + 1} · ${phases[index % 4]}</text></svg>`);
    const card = await sharp({ create: { width: 320, height: 460, channels: 4, background: '#7f929e' } })
      .composite([{ input: sprite, left: 10, top: 40 }, { input: label, left: 0, top: 0 }]).png().toBuffer();
    await sharp(card).toFile(`${directory}frame-${String(index + 1).padStart(2, '0')}.png`);
    cards.push({ input: card, left: 0, top: index * 460 });
  }
  const pages = await sharp({ create: { width: 320, height: 460 * 8, channels: 4, background: '#7f929e' } }).composite(cards).raw().toBuffer();
  await sharp(pages, { raw: { width: 320, height: 460 * 8, channels: 4, pageHeight: 460 } })
    .gif({ loop: 0, delay: 100, colours: 256 }).toFile(`${directory}walk.gif`);
}
