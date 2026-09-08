import type Phaser from 'phaser';
import type { Point } from '@pointlesh/core';

export type RoomCameraBounds = { x?: number; y?: number; width: number; height: number };
export type PhaserRoomCameraOptions = {
  room: RoomCameraBounds;
  target: () => Point;
  /** Horizontal adventure rooms are the default. */
  axes?: 'horizontal' | 'vertical' | 'both';
  /** Exponential follow rate per second; zero snaps immediately. Defaults to 8. */
  smoothing?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Follow a character through a room with an unrotated Phaser camera. Call update
 * after applying area zoom. Axes no larger than the unzoomed viewport retain the
 * room's origin, preserving the framing of ordinary single-screen rooms.
 *
 * This owns scroll only: it installs no Phaser follow target, bounds or events,
 * and leaves zoom to the character binding or editor. Do not also startFollow.
 */
export class PhaserRoomCamera {
  private room: Required<RoomCameraBounds>;
  private enabled = true;
  private readonly smoothing: number;
  private readonly axes: NonNullable<PhaserRoomCameraOptions['axes']>;

  constructor(readonly camera: Phaser.Cameras.Scene2D.Camera, readonly options: PhaserRoomCameraOptions) {
    this.room = this.validateRoom(options.room);
    this.smoothing = options.smoothing ?? 8;
    if (!Number.isFinite(this.smoothing) || this.smoothing < 0) throw new Error('Camera smoothing must be finite and nonnegative.');
    this.axes = options.axes ?? 'horizontal';
    if (!['horizontal', 'vertical', 'both'].includes(this.axes)) throw new Error('Unknown room camera axes.');
  }

  /** Adopt live room dimensions without changing the camera until update/snap. */
  setRoom(room: RoomCameraBounds): void { this.room = this.validateRoom(room); }

  /** Suspend automatic following while a designer or another camera owner is active. */
  setEnabled(enabled: boolean): void { this.enabled = enabled; }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Camera delta must be finite and nonnegative.');
    if (!this.enabled) return;
    this.apply(this.smoothing === 0 ? 1 : -Math.expm1(-this.smoothing * deltaMs / 1000));
  }

  /** Explicitly reframe after a room transition or save restore, even while disabled. */
  snap(): void { this.apply(1); }

  private apply(amount: number): void {
    const target = this.options.target();
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new Error('Camera target must contain finite coordinates.');
    const camera = this.camera;
    const axis = (position: number, scroll: number, start: number, size: number, viewport: number, zoom: number, origin: number, follow: boolean) => {
      if (!Number.isFinite(viewport) || viewport <= 0 || !Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(origin)) throw new Error('Camera viewport and zoom must be positive and finite.');
      if (!follow || size <= viewport) return start;
      const visibleSize = viewport / zoom;
      const offset = viewport * origin * (1 - 1 / zoom);
      // At a fit-world zoom there may be spare space on both sides. Center it.
      const min = start - offset;
      const max = start + size - visibleSize - offset;
      if (max <= min) return start + (size - visibleSize) / 2 - offset;
      const goal = clamp(position - viewport * origin - viewport * (0.5 - origin) / zoom, min, max);
      // Clamp immediately when a changing zoom or live room resize shrinks bounds.
      return clamp(scroll + (goal - scroll) * amount, min, max);
    };
    camera.setScroll(
      axis(target.x, camera.scrollX, this.room.x, this.room.width, camera.width, camera.zoomX, camera.originX, this.axes !== 'vertical'),
      axis(target.y, camera.scrollY, this.room.y, this.room.height, camera.height, camera.zoomY, camera.originY, this.axes !== 'horizontal'),
    );
  }

  private validateRoom(room: RoomCameraBounds): Required<RoomCameraBounds> {
    const value = { x: room.x ?? 0, y: room.y ?? 0, width: room.width, height: room.height };
    if (!Object.values(value).every(Number.isFinite) || value.width <= 0 || value.height <= 0) throw new Error('Room camera bounds must have finite coordinates and positive dimensions.');
    return value;
  }
}
