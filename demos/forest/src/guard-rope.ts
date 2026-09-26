import type Phaser from 'phaser';

/** Rope around the fallen guard's arms and boots, in the collapse frame's coordinates. */
export function drawGuardRope(rope: Phaser.GameObjects.Graphics, guard?: Phaser.GameObjects.Sprite, bound = false): void {
  rope.clear().setVisible(!!guard?.visible && bound);
  if (!guard || !guard.visible || !bound) return;
  rope.setPosition(guard.x, guard.y).setScale(guard.scaleX, guard.scaleY).setRotation(guard.rotation)
    .setDepth(guard.depth + .01).setAlpha(guard.alpha);
  const x = (fraction: number) => (fraction - guard.originX) * guard.width;
  const y = (fraction: number) => (fraction - guard.originY) * guard.height;
  const strand = guard.width / 160;
  for (const [center, top, bottom] of [[.55, .79, .95], [.81, .87, .97]] as const) {
    for (let wrap = -1; wrap <= 1; wrap++) {
      const offset = wrap * .015;
      const points = [
        { x: x(center + offset - .012), y: y(top + .012) },
        { x: x(center + offset), y: y(top) },
        { x: x(center + offset + .006), y: y(bottom - .012) },
        { x: x(center + offset - .007), y: y(bottom) },
      ];
      for (const [thickness, color] of [[strand * 2.4, 0x49301e], [strand, 0xc4a16b]] as const) {
        rope.lineStyle(thickness, color).beginPath().moveTo(points[0]!.x, points[0]!.y);
        for (const point of points.slice(1)) rope.lineTo(point.x, point.y);
        rope.strokePath();
      }
    }
    // A small knot and two loose ends make each set of wraps readable at game scale.
    const knotX = x(center), knotY = y((top + bottom) / 2);
    rope.fillStyle(0x604329).fillRect(knotX - strand * 2, knotY - strand * 2, strand * 4, strand * 4);
    rope.lineStyle(strand, 0xddbd81).lineBetween(knotX - strand, knotY - strand, knotX + strand, knotY + strand);
    rope.lineStyle(strand, 0xc4a16b).lineBetween(knotX, knotY, knotX + strand * 4, knotY + strand * 3)
      .lineBetween(knotX, knotY, knotX - strand * 3, knotY + strand * 5);
  }
}
