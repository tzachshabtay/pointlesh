import type Phaser from 'phaser';
import type { ResolvedPointleshObject } from '@pointlesh/core';

export type ObjectLightSurface = { image: Phaser.GameObjects.Image; revision?: unknown };
let nextLightId = 0;

/** A warm reflected-light layer, preserving the room's painted surface detail and shadows. */
export class PhaserObjectLight {
  private readonly key = `pointlesh-object-light-${++nextLightId}`;
  private image?: Phaser.GameObjects.Image;
  private texture?: Phaser.Textures.CanvasTexture;
  private signature?: string;

  constructor(private readonly scene: Phaser.Scene, private readonly surface: () => ObjectLightSurface | undefined) {}

  sync(object: ResolvedPointleshObject, sprite: Phaser.GameObjects.Sprite): void {
    const properties = object.properties, surface = this.surface();
    if (!surface || !object.enabled || properties.lightEnabled !== true) { this.image?.setVisible(false); return; }
    const number = (key: string, fallback: number) => typeof properties[key] === 'number' && Number.isFinite(properties[key]) ? properties[key] as number : fallback;
    const rx = Math.max(1, number('lightRadiusX', 100)), ry = Math.max(1, number('lightRadiusY', 100));
    const x = sprite.x + number('lightOffsetX', 0), y = sprite.y + number('lightOffsetY', 0);
    const background = surface.image, frame = background.frame;
    const color = typeof properties.lightColor === 'string' && /^#[\da-f]{6}$/i.test(properties.lightColor) ? properties.lightColor : '#ffa34d';
    const signature = JSON.stringify([background.texture.key, surface.revision, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      background.x, background.y, background.displayWidth, background.displayHeight, background.originX, background.originY, x, y, rx, ry, color]);
    if (signature !== this.signature) {
      this.signature = signature;
      const sx = frame.cutWidth / background.displayWidth, sy = frame.cutHeight / background.displayHeight;
      const width = Math.max(1, Math.ceil(rx * 2 * sx)), height = Math.max(1, Math.ceil(ry * 2 * sy));
      this.texture ??= this.scene.textures.createCanvas(this.key, width, height) ?? undefined;
      if (!this.texture) return;
      if (this.texture.width !== width || this.texture.height !== height) this.texture.setSize(width, height);
      const context = this.texture.context;
      context.save(); context.clearRect(0, 0, width, height); context.imageSmoothingEnabled = false;
      // Sample the actual scenery, so mortar and shadows stay dark while the
      // exposed stone faces catch light. No flat-colored disc covers the room.
      const left = background.x - background.originX * background.displayWidth, top = background.y - background.originY * background.displayHeight;
      context.drawImage(background.texture.getSourceImage() as CanvasImageSource,
        frame.cutX + (x - rx - left) * sx, frame.cutY + (y - ry - top) * sy, rx * 2 * sx, ry * 2 * sy, 0, 0, width, height);
      context.globalCompositeOperation = 'multiply'; context.fillStyle = color; context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'destination-in';
      context.translate(width / 2, height / 2); context.scale(width / 2, height / 2);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(.25, 'rgba(255,255,255,.9)');
      gradient.addColorStop(.65, 'rgba(255,255,255,.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient; context.fillRect(-1, -1, 2, 2); context.restore();
      this.texture.setSmoothPixelArt(true); this.texture.refresh();
      this.image ??= this.scene.add.image(x, y, this.key).setName(`pointlesh-light:${object.id}`).setBlendMode('ADD');
      this.image.setPosition(x, y).setDisplaySize(rx * 2, ry * 2);
    }
    const frames = properties.lightFrameIntensities;
    const index = Math.max(0, (sprite.anims.currentFrame?.index ?? 1) - 1);
    const intensity = Array.isArray(frames) && typeof frames[index] === 'number' ? Number(frames[index]) : 1;
    this.image?.setVisible(sprite.visible).setDepth(number('lightDepth', background.depth + .1))
      .setAlpha(Math.max(0, Math.min(1, number('lightIntensity', .5) * intensity)));
  }

  destroy(): void {
    this.image?.destroy(); this.image = undefined;
    if (this.texture) this.scene.textures.remove(this.key);
    this.texture = undefined; this.signature = undefined;
  }
}
