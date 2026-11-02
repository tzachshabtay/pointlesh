/** A distant rainbow, visible only through the sunlit gaps in Bramblehollow's canopy. */
export function drawEndingRainbow(context: CanvasRenderingContext2D, background: CanvasImageSource): void {
  const { width, height } = context.canvas;
  context.drawImage(background, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const colors = [[232, 125, 117], [235, 170, 107], [238, 219, 130], [135, 199, 151], [111, 171, 215], [156, 147, 206]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const r = image.data[index]!, g = image.data[index + 1]!, b = image.data[index + 2]!;
    const wx = x / width * 960, wy = y / height * 540;
    const band = (125 - Math.hypot(wx - 445, wy - 245)) / 5;
    // Keep opaque tree trunks, leaves, roofs, and the entire foreground untouched.
    const sky = wy < 225 && wx > 320 && wx < 570 && r > g * .95 && b > r * .26
      ? Math.max(0, Math.min(1, (Math.min(r, g) - 110) / 85)) : 0;
    const visible = band >= 0 && band < colors.length && wy < 245;
    const color = colors[Math.max(0, Math.min(colors.length - 1, Math.floor(band)))]!;
    const next = colors[Math.min(colors.length - 1, Math.floor(band) + 1)] ?? color;
    const fraction = band - Math.floor(band);
    for (let channel = 0; channel < 3; channel++) image.data[index + channel] = color[channel]! + (next[channel]! - color[channel]!) * fraction;
    image.data[index + 3] = visible ? 190 * sky * Math.min(1, band * 2, (colors.length - band) * 2) : 0;
  }
  context.clearRect(0, 0, width, height);
  context.putImageData(image, 0, 0);
}
