import type Phaser from 'phaser';

export type CinematicKind = 'intro' | 'ending';
export const CINEMATIC_DURATIONS = {
  intro: [6000, 6500, 6000, 6500],
  ending: [6200, 6200, 5600, 6500],
} as const;

type CastId = 'borin' | 'king' | 'guard-front' | 'guard-rear' | 'elder' | 'innkeeper' | 'miner';
type Pose = { x: number; y: number; scale?: number; walking?: boolean; facingLeft?: boolean; angle?: number; alpha?: number; frame?: number };
export type CinematicSnapshot = {
  kind: CinematicKind;
  stepIndex: number;
  elapsedMs: number;
  visible: boolean;
  cast: { id: string; x: number; y: number; visible: boolean }[];
};

const W = 960, H = 540;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t);
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const segment = (t: number, start: number, end: number) => clamp((t - start) / (end - start));

/**
 * Pure presentation of a CutsceneRunner checkpoint. Every pose, effect and camera
 * move derives from (stepIndex, elapsedMs), so save/load needs no hidden tween state.
 * A private camera draws only the cinematic; the gameplay camera is never changed.
 */
export class ForestCinematic {
  private readonly root: Phaser.GameObjects.Container;
  private readonly world: Phaser.GameObjects.Container;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly background: Phaser.GameObjects.Image;
  private readonly atmosphere: Phaser.GameObjects.Graphics;
  private readonly scenery: Phaser.GameObjects.Graphics;
  private readonly props: Phaser.GameObjects.Graphics;
  private readonly foreground: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly fade: Phaser.GameObjects.Rectangle;
  private readonly location: Phaser.GameObjects.Text;
  private readonly cast = new Map<CastId, { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse }>();
  private readonly ignoredObjects = new Map<Phaser.GameObjects.GameObject, number>();
  private stepIndex = 0;
  private elapsedMs = 0;
  private visible = true;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, readonly kind: CinematicKind) {
    this.root = scene.add.container(0, 0).setName('pointlesh-cinematic').setDepth(5000);
    this.world = scene.add.container(0, 0);
    this.root.add(this.world);
    this.background = scene.add.image(0, 0, 'room.village').setOrigin(0).setDepth(-1000);
    this.scenery = scene.add.graphics().setDepth(-10);
    this.atmosphere = scene.add.graphics().setDepth(0);
    this.props = scene.add.graphics().setDepth(850);
    this.foreground = scene.add.graphics().setDepth(900);
    this.world.add([this.background, this.scenery, this.atmosphere, this.props, this.foreground]);
    const actors: [CastId, string][] = [
      ['borin', 'borin'], ['king', 'king'], ['guard-front', 'guard'],
      ['guard-rear', 'guard'], ['elder', 'elder'], ['innkeeper', 'innkeeper'], ['miner', 'miner'],
    ];
    for (const [id, texture] of actors) {
      const shadow = scene.add.ellipse(0, 0, 40, 10, 0x07120e, 0.35);
      const sprite = scene.add.sprite(0, 0, `actor.${texture}`, 4).setOrigin(0.5, 0.94).setName(`cinematic-${id}`);
      this.world.add([shadow, sprite]);
      this.cast.set(id, { sprite, shadow });
    }
    this.frame = scene.add.graphics();
    this.frame.fillStyle(0x07100d, 1).fillRect(0, 0, W, 34).fillRect(0, H - 28, W, 28);
    this.frame.lineStyle(1, 0xb69860, 0.4).lineBetween(0, 34, W, 34).lineBetween(0, H - 28, W, H - 28);
    this.location = scene.add.text(25, 12, '', { fontFamily: 'monospace', fontSize: '10px', color: '#d4c69c', letterSpacing: 2 });
    this.fade = scene.add.rectangle(0, 0, W, H, 0x06100c, 1).setOrigin(0).setAlpha(0);
    this.root.add([this.frame, this.location, this.fade]);

    this.camera = scene.cameras.add(0, 0, W, H, false, 'pointlesh-cinematic-camera');
    this.camera.setBackgroundColor('#07110d').setRoundPixels(true);
    for (const camera of scene.cameras.cameras) if (camera !== this.camera) camera.ignore(this.root);
    this.excludeGameplayObjects();
    scene.events.once('shutdown', this.destroy, this);
    this.render(0, 0);
  }

  render(stepIndex: number, elapsedMs: number): void {
    if (this.destroyed) return;
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 4 || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid cinematic checkpoint');
    this.stepIndex = stepIndex;
    this.elapsedMs = elapsedMs;
    if (stepIndex === 4) { this.setVisible(false); return; }
    this.excludeGameplayObjects();
    for (const { sprite, shadow } of this.cast.values()) { sprite.setVisible(false); shadow.setVisible(false); }
    this.scenery.clear(); this.atmosphere.clear(); this.props.clear(); this.foreground.clear();
    const duration = CINEMATIC_DURATIONS[this.kind][stepIndex]!;
    const t = clamp(elapsedMs / duration);
    if (this.kind === 'intro') this.intro(stepIndex, t);
    else this.ending(stepIndex, t);
    this.world.sort('depth');
    // Short cuts connect actual animated shots; the opening starts visibly in motion.
    const inFade = stepIndex === 0 ? 0 : 1 - clamp(elapsedMs / 220);
    const outFade = clamp((elapsedMs - duration + 280) / 280);
    this.fade.setAlpha(Math.max(inFade, outFade));
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.visible = visible;
    this.root.setVisible(visible);
    this.camera.setVisible(visible);
  }

  snapshot(): CinematicSnapshot {
    return {
      kind: this.kind, stepIndex: this.stepIndex, elapsedMs: this.elapsedMs, visible: this.visible && !this.destroyed,
      cast: [...this.cast].map(([id, { sprite }]) => ({ id, x: sprite.x, y: sprite.y, visible: !this.destroyed && this.visible && sprite.visible })),
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('shutdown', this.destroy, this);
    // Restore only the bit this camera owns. Another subsystem may have changed
    // other camera filters while the cinematic was open.
    for (const [object, originalFilter] of this.ignoredObjects) {
      object.cameraFilter = (object.cameraFilter & ~this.camera.id) | (originalFilter & this.camera.id);
    }
    this.ignoredObjects.clear();
    this.scene.cameras.remove(this.camera, true);
    this.root.destroy(true);
    this.cast.clear();
  }

  private excludeGameplayObjects(): void {
    for (const object of this.scene.children.list) {
      if (object === this.root || this.ignoredObjects.has(object)) continue;
      this.ignoredObjects.set(object, object.cameraFilter);
      // Directly setting the documented GameObject camera bit avoids recursively
      // modifying child filters; ignoring the outer container already hides it.
      object.cameraFilter |= this.camera.id;
    }
  }

  private shot(room: string, name: string, zoom: number, focusX = 480, focusY = 285, tint = 0xffffff): void {
    this.background.setTexture(`room.${room}`).setTint(tint);
    this.location.setText(name);
    const x = Math.max(W / (2 * zoom), Math.min(W - W / (2 * zoom), focusX));
    const y = Math.max(H / (2 * zoom), Math.min(H - H / (2 * zoom), focusY));
    this.world.setScale(zoom).setPosition(W / 2 - x * zoom, H / 2 - y * zoom);
  }

  private pose(id: CastId, pose: Pose): Phaser.GameObjects.Sprite {
    const { sprite, shadow } = this.cast.get(id)!;
    const scale = pose.scale ?? (id.startsWith('guard') ? 3.8 : 3.05);
    const animation = pose.walking ? Math.floor(this.elapsedMs / 105) % 4 : 4 + Math.floor(this.elapsedMs / 650) % 2;
    const profile = pose.walking || pose.facingLeft;
    sprite.setVisible(true).setAlpha(pose.alpha ?? 1).setPosition(pose.x, pose.y)
      .setScale(scale).setFlipX(!!profile && !pose.facingLeft).setAngle(pose.angle ?? 0)
      .setFrame(pose.frame ?? (profile ? 16 + animation : animation)).setDepth(pose.y);
    shadow.setVisible(true).setPosition(pose.x, pose.y - 1).setScale(scale / 2.6, 1).setDepth(pose.y - 0.5).setAlpha(0.33 * (pose.alpha ?? 1));
    if (id === 'king') {
      const y = pose.y - 25 * scale;
      const crown = [
        { x: pose.x - 5 * scale, y }, { x: pose.x - 6 * scale, y: y - 4 * scale },
        { x: pose.x - 2 * scale, y: y - 2 * scale }, { x: pose.x, y: y - 5 * scale },
        { x: pose.x + 2 * scale, y: y - 2 * scale }, { x: pose.x + 6 * scale, y: y - 4 * scale },
        { x: pose.x + 5 * scale, y },
      ];
      this.props.fillStyle(0xe4bc54).beginPath().moveTo(crown[0]!.x, crown[0]!.y);
      for (const point of crown.slice(1)) this.props.lineTo(point.x, point.y);
      this.props.closePath().fillPath();
      this.props.fillStyle(0xffe08a).fillRect(pose.x - 5 * scale, y - scale, 10 * scale, scale);
      this.props.fillStyle(0x9b4e41).fillRect(pose.x - scale, y - 3 * scale, 2 * scale, 2 * scale);
    }
    return sprite;
  }

  private spear(x: number, y: number, left = false): void {
    const side = left ? -1 : 1;
    this.props.lineStyle(4, 0x4d3427).lineBetween(x + side * 21, y - 11, x + side * 25, y - 117);
    this.props.fillStyle(0xb0ad8b).fillTriangle(x + side * 25, y - 131, x + side * 18, y - 113, x + side * 31, y - 113);
    this.props.lineStyle(1, 0xeee3b8, 0.6).lineBetween(x + side * 25, y - 129, x + side * 23, y - 116);
  }

  private mist(tint: number, alpha: number): void {
    const time = this.elapsedMs / 1000;
    for (let row = 0; row < 3; row++) {
      const shift = ((time * (12 + row * 4) + row * 217) % 1250) - 170;
      this.atmosphere.fillStyle(tint, alpha).fillEllipse(shift, 343 + row * 42, 590, 29 + row * 9);
    }
    for (let i = 0; i < 16; i++) {
      const x = 40 + (i * 139) % 885 + Math.sin(time * 0.6 + i) * 7;
      const y = 90 + (i * 67) % 290 + Math.cos(time * 0.7 + i) * 8;
      this.atmosphere.fillStyle(0xe4d595, 0.25 + (Math.sin(time * 1.4 + i) + 1) * 0.14).fillRect(x, y, i % 4 === 0 ? 3 : 2, 2);
    }
  }

  private cage(openness: number): void {
    const open = clamp(openness);
    // The baked room has a closed cage. These timber rails and its dark interior
    // provide an animated door without changing the original background artwork.
    this.scenery.fillStyle(0x0d140e).fillRect(725, 243, 99, 108);
    // Irregular, low-contrast pixel clusters echo the rough timber in the room.
    for (let row = 0; row < 17; row++) for (let column = 0; column < 14; column++) {
      const seed = (row * 29 + column * 47) % 11;
      if (seed < 6) this.scenery.fillStyle([0x182015, 0x1e2518, 0x252a1b][seed % 3]!).fillRect(731 + column * 6, 247 + row * 6, seed % 2 ? 5 : 3, seed % 3 ? 3 : 5);
    }
    this.scenery.fillStyle(0x10170f).fillRect(728, 244, 9, 104).fillRect(812, 244, 10, 104);
    this.scenery.fillStyle(0x3b3420).fillRect(728, 340, 95, 9);
    this.scenery.lineStyle(2, 0x5b4a2a).lineBetween(730, 344, 819, 344);
    const width = lerp(97, 17, smooth(open));
    const x = lerp(725, 708, smooth(open));
    this.foreground.lineStyle(6, 0x463c23).strokeRect(x, 242, width, 110);
    this.foreground.lineStyle(2, 0x9a7b41, 0.8).strokeRect(x + 2, 244, width - 4, 106);
    for (let i = 1; i < 4; i++) {
      const barX = x + width * i / 4;
      this.foreground.lineStyle(5, 0x51452a).lineBetween(barX, 246, barX, 349);
      this.foreground.lineStyle(1, 0xa7894f).lineBetween(barX - 1, 246, barX - 1, 349);
    }
    this.foreground.lineStyle(5, 0x665333).lineBetween(x, 286, x + width, 286);
    for (let row = 0; row < 13; row++) {
      this.foreground.fillStyle(row % 3 ? 0x8b713e : 0x352e1c).fillRect(x - 2, 248 + row * 8, 4, row % 2 ? 3 : 5);
      this.foreground.fillStyle(row % 2 ? 0x9a7a42 : 0x3a321e).fillRect(x + width - 2, 249 + row * 8, 4, 3);
      for (let bar = 1; bar < 4; bar++) this.foreground.fillStyle(row % 2 ? 0x8d723d : 0x3a301c).fillRect(x + width * bar / 4 - 2, 252 + row * 7, 3, 2);
    }
  }

  private rope(x1: number, y1: number, x2: number, y2: number): void {
    this.props.lineStyle(4, 0x513c27).lineBetween(x1, y1, x2, y2);
    this.props.lineStyle(2, 0xc1a16a).lineBetween(x1, y1, x2, y2);
  }

  private intro(step: number, t: number): void {
    if (step === 0) {
      this.shot('village', 'BRAMBLEHOLLOW · BEFORE DAWN', lerp(1.03, 1.12, t), lerp(465, 500, t), 296, 0xaebbc6);
      const kingX = lerp(468, 576, segment(t, 0, 0.52));
      const rearX = lerp(75, 447, smooth(segment(t, 0, 0.85)));
      const frontX = lerp(925, 666, smooth(segment(t, 0, 0.80)));
      this.pose('king', { x: kingX, y: 427, walking: t < 0.52, facingLeft: t > 0.72 });
      this.pose('guard-rear', { x: rearX, y: 442, walking: t < 0.85 });
      this.pose('guard-front', { x: frontX, y: 440, walking: t < 0.8, facingLeft: true });
      this.pose('elder', { x: lerp(324, 267, segment(t, 0.18, 0.62)), y: 415, scale: 2.7, walking: t > 0.18 && t < 0.62, facingLeft: true });
      this.spear(rearX, 442); this.spear(frontX, 440, true);
      this.mist(0xa9bac3, 0.065);
      if (t > 0.72) this.rope(rearX + 22, 400, kingX - 15, 394);
    } else if (step === 1) {
      this.shot('forest', 'THE WHISPERING WOOD · TAKEN EAST', lerp(1.09, 1.18, t), lerp(440, 525, t), 296, 0xb6c4ca);
      const x = lerp(202, 710, t);
      const y = 441 - Math.sin(t * Math.PI) * 19;
      this.pose('guard-front', { x: x + 99, y: y - 2, walking: true });
      this.pose('king', { x, y, walking: true, scale: 2.9 });
      this.pose('guard-rear', { x: x - 89, y: y + 5, walking: true });
      this.spear(x + 99, y - 2); this.spear(x - 89, y + 5);
      this.rope(x - 64, y - 35, x - 9, y - 36);
      this.rope(x + 11, y - 37, x + 75, y - 37);
      this.mist(0xc2cbb3, 0.08);
    } else if (step === 2) {
      this.shot('camp', 'THE ORC ENCAMPMENT · NO WAY OUT', lerp(1.12, 1.30, t), 588, 291, 0xa8b6bf);
      const entry = smooth(segment(t, 0, 0.70));
      const kingX = lerp(536, 775, entry), kingY = lerp(427, 343, entry);
      this.pose('king', { x: kingX, y: kingY, walking: t < 0.70, scale: lerp(3.0, 2.6, entry), facingLeft: t > 0.74 });
      this.pose('guard-front', { x: lerp(651, 872, entry), y: 420, walking: t < 0.70, facingLeft: t > 0.7 });
      this.pose('guard-rear', { x: lerp(433, 616, entry), y: 437, walking: t < 0.70 });
      this.spear(lerp(433, 616, entry), 437);
      this.cage(1 - segment(t, 0.69, 0.87));
      if (t > 0.87) {
        this.foreground.fillStyle(0x9d9774).fillRect(770, 296, 12, 15);
        this.foreground.lineStyle(3, 0xb4af8c).strokeRect(773, 289, 7, 11);
        this.foreground.fillStyle(0x2f3326).fillRect(775, 301, 3, 5);
      }
      this.mist(0x75928b, 0.045);
    } else {
      this.shot('village', 'BRAMBLEHOLLOW · A QUIETER HERO', lerp(1.07, 1.18, t), 487, 292);
      const arrive = smooth(segment(t, 0, 0.70));
      this.pose('elder', { x: 385, y: 423, scale: 2.9, frame: 6 + Math.floor(this.elapsedMs / 190) % 2 });
      const borinX = lerp(749, 485, arrive), borinY = lerp(370, 437, arrive);
      this.pose('borin', { x: borinX, y: borinY, scale: lerp(2.5, 3.15, arrive), walking: t < 0.7, facingLeft: true });
      this.mist(0xa4bd8b, 0.035);
      if (t > 0.75) {
        const lift = Math.sin(segment(t, 0.75, 1) * Math.PI) * 15;
        this.props.lineStyle(8, 0x46756a).lineBetween(borinX - 18, borinY - 45, borinX - 29, borinY - 51 - lift);
        this.props.fillStyle(0xe4bd8c).fillRect(borinX - 33, borinY - 57 - lift, 8, 8);
      }
    }
  }

  private ending(step: number, t: number): void {
    if (step === 0) {
      this.shot('camp', 'THE ORC ENCAMPMENT · ONE GOOD STRIKE', lerp(1.18, 1.30, t), 585, 301);
      this.pose('king', { x: 778, y: 343, scale: 2.6 });
      const borinX = lerp(660, 704, smooth(segment(t, 0, 0.35)));
      this.pose('borin', { x: borinX, y: 424, scale: 3.1, walking: t < 0.35 });
      this.sleepingGuard();
      this.cage(segment(t, 0.61, 0.90));
      const swing = segment(t, 0.23, 0.58);
      const angle = lerp(-2.35, -0.89, smooth(swing)) + smooth(segment(t, 0.76, 1)) * 1.2;
      const handX = borinX + 14, handY = 370;
      const axeX = handX + Math.cos(angle) * 84, axeY = handY + Math.sin(angle) * 84;
      this.props.lineStyle(6, 0x664b2e).lineBetween(handX, handY, axeX, axeY);
      this.props.lineStyle(3, 0xc2a571).lineBetween(handX + 1, handY, axeX + 1, axeY);
      this.props.lineStyle(9, 0xc8c5ae).lineBetween(axeX - Math.sin(angle) * 18, axeY + Math.cos(angle) * 18, axeX + Math.sin(angle) * 18, axeY - Math.cos(angle) * 18);
      this.rope(826, 264, 817, 447);
      if (t < 0.58) {
        this.foreground.fillStyle(0xb7b18b).fillRect(770, 296, 12, 15);
      } else {
        const fall = segment(t, 0.58, 0.92);
        const lockY = 302 + fall * fall * 140;
        this.props.fillStyle(0xc9c29c).fillRect(774 + Math.sin(fall * 8) * 7, lockY, 9, 12);
        for (let i = 0; i < 9; i++) {
          const age = segment(t, 0.55, 0.76), radius = age * 58;
          this.foreground.fillStyle(i % 2 ? 0xf0da89 : 0xfff2b0, 1 - age).fillRect(770 + Math.cos(i * 2.4) * radius, 318 + Math.sin(i * 2.4) * radius + age * 18, 3, 3);
        }
      }
      this.mist(0xe5b05b, 0.025);
    } else if (step === 1) {
      this.shot('camp', 'A STOUT ROPE · A KING SET FREE', lerp(1.26, 1.16, t), 570, 298);
      this.cage(1);
      this.rope(826, 259, 817 + Math.sin(t * 8) * 3, 460);
      const down = smooth(segment(t, 0, 0.62));
      const flee = smooth(segment(t, 0.69, 1));
      const kingX = lerp(796, 810, down) - flee * 230;
      const kingY = lerp(339, 447, down);
      this.pose('king', { x: kingX, y: kingY, scale: lerp(2.6, 3.05, down), frame: t < 0.62 ? Math.floor(this.elapsedMs / 140) % 4 : undefined, walking: t > 0.69, facingLeft: true });
      this.pose('borin', { x: lerp(742, 529, flee), y: 454, scale: 3.15, walking: t > 0.69, facingLeft: t > 0.69 });
      this.sleepingGuard();
      if (t < 0.65) {
        this.props.lineStyle(6, 0x9b514e).lineBetween(kingX + 12, kingY - 40, 817, kingY - 48);
        this.props.fillStyle(0xe8c293).fillRect(813, kingY - 53, 8, 8);
      }
      this.mist(0xb3c4a8, 0.025);
    } else if (step === 2) {
      this.shot('forest', 'THE WHISPERING WOOD · RUN FOR HOME', lerp(1.13, 1.07, t), lerp(528, 451, t), 290);
      const x = lerp(784, 162, t), y = 445 - Math.sin(t * Math.PI) * 15;
      this.pose('borin', { x: x - 68, y, scale: 3.1, walking: true, facingLeft: true });
      this.pose('king', { x: x + 28, y: y + 3, scale: 3.0, walking: true, facingLeft: true });
      this.mist(0xc3cead, 0.05);
      // Fireflies and wind-blown leaves make the escape read as continuous motion.
      for (let i = 0; i < 13; i++) {
        const leafX = (i * 107 + this.elapsedMs * 0.055) % 1020 - 30;
        const leafY = 94 + (i * 31) % 218 + Math.sin(this.elapsedMs / 430 + i) * 15;
        this.foreground.fillStyle(i % 2 ? 0xcaa65c : 0x8eaa65, 0.65).fillRect(leafX, leafY, 5, 2);
      }
    } else {
      this.shot('village', 'BRAMBLEHOLLOW · HOME AGAIN', lerp(1.15, 1.04, t), 482, 290, 0xfff4d9);
      const arrive = smooth(segment(t, 0, 0.67));
      this.pose('borin', { x: lerp(584, 476, arrive), y: lerp(347, 435, arrive), scale: lerp(2.35, 3.1, arrive), walking: t < 0.67, facingLeft: true });
      this.pose('king', { x: lerp(661, 566, arrive), y: lerp(352, 436, arrive), scale: lerp(2.4, 3.1, arrive), walking: t < 0.67, facingLeft: true });
      this.pose('elder', { x: 359, y: 433, scale: 3.0, frame: 6 + Math.floor(this.elapsedMs / 220) % 2 });
      this.pose('innkeeper', { x: 274, y: 438 - Math.max(0, Math.sin(this.elapsedMs / 300)) * segment(t, 0.36, 0.62) * 8, scale: 2.8 });
      this.pose('miner', { x: 690, y: 441 - Math.max(0, Math.sin(this.elapsedMs / 320 + 1)) * segment(t, 0.36, 0.62) * 8, scale: 2.8 });
      this.mist(0xd9d49b, 0.025);
      const cheer = segment(t, 0.44, 0.7);
      for (let i = 0; i < 27; i++) {
        const cycle = (this.elapsedMs / 1700 + i * 0.117) % 1;
        const x = 198 + (i * 139) % 565 + Math.sin(cycle * 8 + i) * 15;
        const y = lerp(172, 436, cycle);
        this.foreground.fillStyle([0xedd58e, 0xb7ca91, 0xe1a26f][i % 3]!, cheer * 0.8).fillRect(x, y, 3, i % 2 ? 5 : 3);
      }
    }
  }

  private sleepingGuard(): void {
    this.pose('guard-front', { x: 548, y: 447, scale: 3.5, angle: 82, frame: 4 });
    const bob = Math.sin(this.elapsedMs / 340) * 3;
    for (let i = 0; i < 3; i++) {
      const x = 470 - i * 12, y = 391 - i * 17 + bob;
      this.props.lineStyle(2, 0xd3d8bb, 0.7 - i * 0.14).lineBetween(x, y, x + 7, y).lineBetween(x + 7, y, x, y + 7).lineBetween(x, y + 7, x + 7, y + 7);
    }
  }
}
