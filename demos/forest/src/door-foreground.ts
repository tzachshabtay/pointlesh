import type Phaser from 'phaser';
import type { ResolvedPointleshArea } from '@pointlesh/core';
import { createWalkBehindOverlay } from '@pointlesh/phaser';
import type { ForestDoorLayout } from './door-layout';
import masks from './door-occlusion.json';

/** Keep passage pixels behind actors while the moving leaf uses doorway depth. */
export class DoorForeground {
  readonly image: Phaser.GameObjects.Image;
  private readonly overlay: ReturnType<typeof createWalkBehindOverlay>;
  private signature = '';
  constructor(scene: Phaser.Scene, readonly source: Phaser.GameObjects.Sprite, readonly door: ForestDoorLayout) {
    this.image = scene.add.image(source.x, source.y, source.texture.key, source.frame.name);
    const area = this.area(door.crop.top * door.scaleY, true);
    this.overlay = createWalkBehindOverlay(scene, area, this.image);
    source.once('destroy', () => this.overlay.destroy());
  }
  private area(baseline: number, enabled: boolean): ResolvedPointleshArea {
    return { id: this.door.id, areaId: this.door.id, name: this.door.name, layerId: 'door-foreground', kind: 'walk-behind',
      properties: { baseline }, behaviors: [], enabled, closed: true, polygon: [] };
  }
  sync(frame: number, baseline: number, minimumDepth = baseline): void {
    const s = this.source;
    this.image.setTexture(s.texture.key, s.frame.name).setPosition(s.x, s.y).setScale(s.scaleX, s.scaleY)
      .setOrigin(s.originX, s.originY).setRotation(s.rotation).setFlip(s.flipX, s.flipY).setAlpha(s.alpha);
    const signature = JSON.stringify([frame, baseline, s.visible, s.x, s.y, s.scaleX, s.scaleY, s.rotation, s.originX, s.originY, s.flipX, s.flipY, s.displayWidth, s.displayHeight]);
    if (signature === this.signature) { this.image.setDepth(Math.max(baseline, minimumDepth)); return; }
    this.signature = signature;
    const rectangles = (masks as Record<string, number[][][]>)[this.door.id]?.[frame] ?? [];
    const matrix = s.getWorldTransformMatrix();
    const { width, height } = this.door.crop;
    const point = (x: number, y: number) => matrix.transformPoint(((s.flipX ? 1 - x / width : x / width) - s.originX) * s.width, ((s.flipY ? 1 - y / height : y / height) - s.originY) * s.height);
    const polygons = rectangles.map(([x, y, w, h]) => [point(x!, y!), point(x! + w!, y!), point(x! + w!, y! + h!), point(x!, y! + h!)]);
    this.overlay.sync(this.area(baseline, s.visible), polygons);
    this.image.setDepth(Math.max(baseline, minimumDepth));
  }
}
