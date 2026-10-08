import type Phaser from 'phaser';

type Point = { x: number; y: number };
type Beam = { top: Point; bottom: Point; width: number };

// Normalized to the painted forest panorama, rather than the camera viewport.
// Motes stay inside these three shafts even when the room scrolls or zooms.
const forestBeams: Beam[] = [
  { top: { x: .304, y: .18 }, bottom: { x: .277, y: .51 }, width: .018 },
  { top: { x: .390, y: .22 }, bottom: { x: .351, y: .56 }, width: .022 },
  { top: { x: .602, y: .18 }, bottom: { x: .648, y: .55 }, width: .022 },
];
const canopies: Record<string, Point[]> = {
  village: [{ x: .07, y: .09 }, { x: .30, y: .11 }, { x: .64, y: .10 }, { x: .88, y: .09 }],
  forest: [{ x: .06, y: .13 }, { x: .22, y: .12 }, { x: .42, y: .09 }, { x: .55, y: .11 }, { x: .75, y: .13 }, { x: .92, y: .10 }],
  camp: [{ x: .06, y: .08 }, { x: .45, y: .09 }, { x: .66, y: .05 }, { x: .93, y: .08 }],
};
const leafColors = [0x929548, 0xb3a153, 0x788442, 0xa58943];
const fract = (n: number) => n - Math.floor(n);
const noise = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const fade = (progress: number, edge: number) => Math.min(1, progress / edge, (1 - progress) / edge);

/** Small, noninteractive world-space effects shared by gameplay and cinematics.
 * Sampling absolute time makes cutscene seeking repeatable; no emitter backlog
 * accumulates while a tab is asleep, and no particles leak into the next room.
 */
export class OutdoorAtmosphere {
  readonly dust: Phaser.GameObjects.Graphics;
  readonly leaves: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, world?: Phaser.GameObjects.Container) {
    this.dust = scene.add.graphics().setDepth(-800).setName('outdoor-sunbeam-dust');
    this.leaves = scene.add.graphics().setDepth(1000).setName('outdoor-falling-leaves');
    world?.add([this.dust, this.leaves]);
  }

  render(room: string, timeMs: number, width: number, height: number): void {
    const dust = this.dust.clear(), leaves = this.leaves.clear();
    const origins = canopies[room];
    if (!origins) return;
    const time = timeMs / 1000;

    if (room === 'forest') for (const [beamIndex, beam] of forestBeams.entries()) {
      for (let i = 0; i < 18; i++) {
        const seed = beamIndex * 31 + i + 1;
        const progress = fract(noise(seed) + time / (24 + noise(seed + 61) * 20));
        const spread = (noise(seed + 29) - .5) * 1.4 + Math.sin(time * .36 + seed) * .16;
        const x = (beam.top.x + (beam.bottom.x - beam.top.x) * progress + spread * beam.width * (.45 + progress * .55)) * width;
        const y = (beam.top.y + (beam.bottom.y - beam.top.y) * progress) * height;
        const alpha = fade(progress, .18) * (.18 + noise(seed + 91) * .23) * (.82 + Math.sin(time * .8 + seed) * .18);
        const size = i % 6 === 0 ? 1.4 : .8;
        dust.fillStyle(0xf4e5ba, alpha).fillRect(x, y, size, size);
      }
    }

    for (const [i, origin] of origins.entries()) {
      // Long, staggered gaps keep this an occasional leaf, not constant rain.
      const period = 17 + noise(i + 50) * 9;
      const clock = time + noise(i + 70) * period;
      const cycle = Math.floor(clock / period);
      const age = clock % period;
      const lifetime = 9 + noise(i + 90) * 4;
      if (age >= lifetime) continue;
      const progress = age / lifetime;
      const seed = i * 19 + cycle * 7;
      const phase = noise(seed + 21) * Math.PI * 2;
      const x = origin.x * width + (noise(seed + 7) - .5) * width * .04
        + age * (2 + noise(seed + 12) * 3) + Math.sin(age * 1.25 + phase) * 11;
      const y = origin.y * height + progress * height * (.55 + noise(seed + 41) * .23);
      const turn = Math.sin(age * 2.5 + phase);
      const size = 2.4 + noise(seed + 4) * 1.3;
      leaves.save();
      leaves.translateCanvas(x, y);
      leaves.rotateCanvas(Math.sin(age * 1.1 + phase) * .65 + .4);
      leaves.scaleCanvas(.22 + Math.abs(turn) * .78, 1);
      leaves.fillStyle(leafColors[(i + cycle) % leafColors.length]!, fade(progress, .12) * .78);
      leaves.beginPath().moveTo(-size, 0).lineTo(-size * .35, -1.5)
        .lineTo(size * .5, -1).lineTo(size, 0).lineTo(0, 1.7).closePath().fillPath();
      leaves.lineStyle(.6, 0x5a6636, fade(progress, .12) * .5);
      leaves.lineBetween(-size, 0, size * .65, 0);
      leaves.restore();
    }
  }
}
