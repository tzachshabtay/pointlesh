export type NormalFrame = { x: number; y: number; width: number; height: number };

/** A shallow rounded relief from alpha, never from painted colors/highlights.
 * Each atlas cell is isolated; this is an approximation, not an anatomical map. */
export function createSilhouetteNormals(rgba: Uint8ClampedArray, width: number, height: number, frames: readonly NormalFrame[]): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < output.length; i += 4) output.set([128, 128, 255, 255], i);
  for (const frame of frames) {
    const x0 = Math.max(0, Math.floor(frame.x)), y0 = Math.max(0, Math.floor(frame.y));
    const w = Math.min(width - x0, Math.floor(frame.width)), h = Math.min(height - y0, Math.floor(frame.height));
    if (w <= 0 || h <= 0) continue;
    const distance = new Float32Array(w * h), heights = new Float32Array(w * h);
    const radius = Math.max(2, Math.min(w, h) * .08);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      distance[y * w + x] = rgba[((y0 + y) * width + x0 + x) * 4 + 3]! > 16
        ? Math.min(x + 1, y + 1, w - x, h - y, radius) : 0;
    }
    // Chamfer distance to the silhouette, with diagonal neighbors to avoid square rims.
    const diagonal = Math.SQRT2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      distance[i] = Math.min(distance[i]!, x ? distance[i - 1]! + 1 : 1, y ? distance[i - w]! + 1 : 1,
        x && y ? distance[i - w - 1]! + diagonal : diagonal, x + 1 < w && y ? distance[i - w + 1]! + diagonal : diagonal);
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      distance[i] = Math.min(distance[i]!, x + 1 < w ? distance[i + 1]! + 1 : 1, y + 1 < h ? distance[i + w]! + 1 : 1,
        x + 1 < w && y + 1 < h ? distance[i + w + 1]! + diagonal : diagonal, x && y + 1 < h ? distance[i + w - 1]! + diagonal : diagonal);
      const d = Math.min(radius, distance[i]!);
      heights[i] = Math.sqrt(Math.max(0, 2 * radius * d - d * d)) * .35;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (distance[i] === 0) continue;
      const nx = ((x ? heights[i - 1]! : 0) - (x + 1 < w ? heights[i + 1]! : 0)) / 2;
      // Image rows point down; tangent-space green points up.
      const ny = ((y + 1 < h ? heights[i + w]! : 0) - (y ? heights[i - w]! : 0)) / 2;
      const length = Math.hypot(nx, ny, 1), to = ((y0 + y) * width + x0 + x) * 4;
      output[to] = Math.round((nx / length + 1) * 127.5);
      output[to + 1] = Math.round((ny / length + 1) * 127.5);
      output[to + 2] = Math.round((1 / length + 1) * 127.5);
    }
  }
  return output;
}
