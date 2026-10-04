import sharp from 'sharp';

const sourcePath = new URL('../public/art/borin.walk-left.promoted-1790377807996.png', import.meta.url).pathname;
const sourceFrames = await Promise.all(Array.from({ length: 8 }, (_, n) => sharp(sourcePath)
  .extract({ left: n % 3 * 100, top: Math.floor(n / 3) * 140, width: 100, height: 140 }).ensureAlpha().raw().toBuffer()));
const source = sourceFrames[0];
const W = 100, H = 140;
const bob = [0, 2, 0, -2, 0, 2, 0, -2];
// Ankle positions for one leg: stance moves back, then the bent knee swings
// the airborne foot forward. The other leg is four frames out of phase.
const ankle = [[43, 112], [48, 112], [54, 112], [63, 111], [62, 111], [63, 108], [55, 108], [44, 110]];
const bootAngle = [0, 0, 0, -0.12, -0.14, 0.15, 0.05, 0];
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

function bone(out, from, to, sourceTop, sourceBottom, width) {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  for (let y = Math.floor(Math.min(from[1], to[1]) - width); y <= Math.ceil(Math.max(from[1], to[1]) + width); y++) {
    for (let x = Math.floor(Math.min(from[0], to[0]) - width); x <= Math.ceil(Math.max(from[0], to[0]) + width); x++) {
      const along = ((x - from[0]) * dx + (y - from[1]) * dy) / (length * length);
      const across = ((x - from[0]) * dy - (y - from[1]) * dx) / length;
      if (along < -0.08 || along > 1.08 || Math.abs(across) > width / 2) continue;
      over(out, x, y, 46 + across, sourceTop + Math.max(0, Math.min(1, along)) * (sourceBottom - sourceTop));
    }
  }
}

function knee(hip, foot) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1], distance = Math.hypot(dx, dy);
  const bend = Math.sqrt(Math.max(0, 11 * 11 - distance * distance / 4));
  return [(hip[0] + foot[0]) / 2 - dy / distance * bend, (hip[1] + foot[1]) / 2 + dx / distance * bend];
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
  for (const [name, phase, hipX] of [['far', (frame + 4) % 8, 52], ['near', frame, 54]]) {
    const hip = [hipX, 94 + bob[frame]];
    const foot = ankle[phase];
    const joint = knee(hip, foot);
    bone(out, hip, joint, 95, 103, 13);
    bone(out, joint, foot, 101, 108, 11);
    boot(out, foot, bootAngle[phase]);
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
const output = new URL('../public/art/borin.walk-left.manual-v4.png', import.meta.url).pathname;
await sharp(packed, { raw: { width: W * 3, height: H * 3, channels: 4 } }).png().toFile(output);
console.log(output);
if (process.argv.includes('--joints')) console.log(JSON.stringify(joints, null, 2));
