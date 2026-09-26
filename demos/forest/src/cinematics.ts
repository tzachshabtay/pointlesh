import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { CharacterController, pointleshAreaCapabilities, readCharacterAnimations, resolvePointleshScene, type ResolvedPointleshObject } from '@pointlesh/core';
import { createWalkBehindOverlay, PhaserAdventureCharacter } from '@pointlesh/phaser';
import { guardAnimationSize } from './guard-assets';
import { GUARD_DRINK_POINT } from './guard-patrol';
import { borinActionSize, CAGE_DOOR_ID, PICKAXE_START_MS, PICKAXE_IMPACT_MS, rescueAnimation } from './rescue-assets';

export type CinematicKind = 'intro' | 'ending';
export const CINEMATIC_DURATIONS = {
  intro: [6000, 6500, 6000, 6500],
  ending: [6200, 6200, 5600, 6500],
} as const;

type CastId = 'borin' | 'king' | 'guard-front' | 'guard-rear' | 'elder' | 'innkeeper' | 'miner';
type Pose = { x: number; y: number; walking?: boolean; speaking?: boolean; facingLeft?: boolean; facing?: 'up' | 'down' | 'left' | 'right'; alpha?: number; sleeping?: boolean; action?: 'tie-rope-back' | 'pickaxe-back'; actionElapsedMs?: number };
type CastActor = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  assetId?: string;
  definition?: ResolvedPointleshObject;
  binding?: PhaserAdventureCharacter;
  sleeping: boolean;
  action?: 'bound' | 'tie-rope-back' | 'pickaxe-back';
};
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
  private readonly props: Phaser.GameObjects.Graphics;
  private readonly cageDoor: Phaser.GameObjects.Sprite;
  private doorBinding?: PhaserAdventureCharacter;
  private doorDefinition?: ResolvedPointleshObject;
  private overlays: ReturnType<typeof createWalkBehindOverlay>[] = [];
  private overlayRoom?: string;
  private readonly foreground: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly fade: Phaser.GameObjects.Rectangle;
  private readonly location: Phaser.GameObjects.Text;
  private readonly cast = new Map<CastId, CastActor>();
  private readonly ignoredObjects = new Map<Phaser.GameObjects.GameObject, number>();
  private authoredManifest?: SceneDesignerManifest;
  private definitions = new Map<string, ReturnType<typeof resolvePointleshScene>>();
  private room = 'village';
  private stepIndex = 0;
  private elapsedMs = 0;
  private visible = true;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, readonly kind: CinematicKind,
    private readonly assets: AiAssetRuntime, private readonly getManifest: () => SceneDesignerManifest) {
    this.root = scene.add.container(0, 0).setName('pointlesh-cinematic').setDepth(5000);
    this.world = scene.add.container(0, 0);
    this.root.add(this.world);
    this.background = scene.add.image(0, 0, 'room.village').setOrigin(0).setDepth(-1000);
    this.atmosphere = scene.add.graphics().setDepth(0);
    this.props = scene.add.graphics().setDepth(850);
    this.cageDoor = scene.add.sprite(0, 0, '__WHITE').setName('cage-door-cinematic').setVisible(false);
    this.foreground = scene.add.graphics().setDepth(900);
    this.world.add([this.background, this.atmosphere, this.props, this.foreground, this.cageDoor]);
    const actors: CastId[] = ['borin', 'king', 'guard-front', 'guard-rear', 'elder', 'innkeeper', 'miner'];
    for (const id of actors) {
      const shadow = scene.add.ellipse(0, 0, 40, 10, 0x07120e, 0.35);
      const sprite = scene.add.sprite(0, 0, '__WHITE').setVisible(false).setName(`cinematic-${id}`);
      this.world.add([shadow, sprite]);
      this.cast.set(id, { sprite, shadow, sleeping: false });
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
    const manifest = this.getManifest();
    if (manifest !== this.authoredManifest) {
      this.definitions = new Map(Object.keys(manifest.scenes).map(id => [id, resolvePointleshScene(manifest, id)]));
      this.authoredManifest = manifest;
      this.overlayRoom = undefined;
    }
    this.excludeGameplayObjects();
    for (const { sprite, shadow } of this.cast.values()) { sprite.setVisible(false); shadow.setVisible(false); }
    this.atmosphere.clear(); this.props.clear(); this.foreground.clear();
    this.cageDoor.setVisible(false);
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
    for (const { binding } of this.cast.values()) binding?.destroy();
    this.doorBinding?.destroy();
    for (const overlay of this.overlays) overlay.destroy();
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
    this.room = room;
    if (this.overlayRoom !== room) {
      for (const overlay of this.overlays) overlay.destroy();
      this.overlays = [];
      for (const area of this.definitions.get(room)?.areas ?? []) {
        if (!area.enabled || !pointleshAreaCapabilities(area).walkBehind) continue;
        const size = this.definitions.get(room)!;
        const image = this.scene.add.image(0, 0, `room.${room}`).setOrigin(0).setDisplaySize(size.width, size.height);
        this.world.add(image);
        this.overlays.push(createWalkBehindOverlay(this.scene, area, image, { destroyImage: true }));
      }
      this.overlayRoom = room;
    }
    for (const overlay of this.overlays) overlay.image.setTint(tint);
    this.background.setTexture(`room.${room}`).setTint(tint);
    this.location.setText(name);
    const x = Math.max(W / (2 * zoom), Math.min(W - W / (2 * zoom), focusX));
    const y = Math.max(H / (2 * zoom), Math.min(H - H / (2 * zoom), focusY));
    this.world.setScale(zoom).setPosition(W / 2 - x * zoom, H / 2 - y * zoom);
  }

  private pose(id: CastId, pose: Pose): Phaser.GameObjects.Sprite {
    const actor = this.cast.get(id)!;
    actor.sleeping = pose.sleeping ?? false;
    actor.action = actor.sleeping ? 'bound' : pose.action;
    const { sprite, shadow } = actor;
    const characterId = id.startsWith('guard') ? 'guard' : id;
    const matches = (object: ResolvedPointleshObject) => object.prefabId === `forest.character.${characterId}`;
    // Prefer the shot's scene overrides, then the character's home scene. Editor
    // eye/lock flags never affect the cutscene cast.
    actor.definition = this.definitions.get(this.room)?.objects.find(matches)
      ?? [...this.definitions.values()].flatMap(room => room.objects).find(matches);
    if (!actor.definition) throw new Error(`Missing cinematic character prefab: ${characterId}`);
    const assetId = actor.definition.assetId;
    if (!actor.binding || actor.assetId !== assetId) {
      actor.binding?.destroy();
      actor.assetId = assetId;
      actor.binding = new PhaserAdventureCharacter(this.scene,
        new CharacterController({ id: `cinematic-${id}`, position: { x: pose.x, y: pose.y } }), sprite, {
          autoUpdate: false, aiRuntime: this.assets, assetId,
          baseScale: () => ({ x: actor.definition!.scaleX, y: actor.definition!.scaleY }),
          ...(characterId === 'guard' ? { baseSize: () => guardAnimationSize(this.assets.manifest.assets[assetId], actor.sleeping) }
            : characterId === 'borin' ? { baseSize: () => borinActionSize(this.assets.manifest.assets[assetId], !!actor.action) } : {}),
          areas: () => actor.definition!.properties.ignoreScaling ? [] : this.definitions.get(this.room)?.areas ?? [],
          origin: () => ({ x: actor.definition!.anchorX, y: 1 - actor.definition!.anchorY }),
          angle: () => actor.definition!.rotation,
          animations: () => actor.action ? rescueAnimation(assetId, actor.action) : readCharacterAnimations(actor.definition!.properties),
        });
    }
    actor.binding.renderPose({ position: { x: pose.x, y: pose.y },
      activity: actor.action ? 'idle' : pose.speaking ? 'speaking' : pose.walking ? 'walking' : 'idle',
      facing: pose.facing ?? (pose.facingLeft ? 'left' : pose.walking ? 'right' : 'down'),
    }, actor.sleeping ? Number.MAX_SAFE_INTEGER : pose.actionElapsedMs ?? this.elapsedMs, { loop: !actor.action });
    sprite.setVisible(true).setAlpha(pose.alpha ?? 1);
    shadow.setVisible(true).setPosition(pose.x, pose.y - 1).setDisplaySize(sprite.displayWidth * .7, 10).setDepth(pose.y - 0.5).setAlpha(0.33 * (pose.alpha ?? 1));
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

  private cage(openness: number, elapsedMs?: number): void {
    this.doorDefinition = this.definitions.get('camp')?.objects.find(object => object.id === CAGE_DOOR_ID);
    const door = this.doorDefinition;
    if (!door) return;
    if (!this.doorBinding || this.doorBinding.options.assetId !== door.assetId) {
      this.doorBinding?.destroy();
      this.doorBinding = new PhaserAdventureCharacter(this.scene,
        new CharacterController({ id: 'cinematic-cage-door', position: door.position }), this.cageDoor, {
          autoUpdate: false, aiRuntime: this.assets, assetId: door.assetId,
          baseScale: () => ({ x: this.doorDefinition!.scaleX, y: this.doorDefinition!.scaleY }),
          origin: () => ({ x: this.doorDefinition!.anchorX, y: 1 - this.doorDefinition!.anchorY }),
          angle: () => this.doorDefinition!.rotation,
          animations: () => rescueAnimation(this.doorDefinition!.assetId, 'open'),
        });
    }
    this.doorBinding.renderPose({ position: door.position, activity: 'idle', facing: 'down' },
      elapsedMs ?? clamp(openness) * this.doorBinding.animationDurationMs, { loop: false });
    this.cageDoor.setVisible(door.enabled);
  }

  private cagePositions() {
    const door = this.definitions.get('camp')!.objects.find(object => object.id === CAGE_DOOR_ID)!;
    const king = this.definitions.get('camp')!.objects.find(object => object.properties.actorName === 'king')!;
    return { king: king.position, strike: { x: door.position.x + 35, y: door.position.y + 24 },
      outside: { x: door.position.x + 36, y: door.position.y + 66 } };
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
      this.pose('elder', { x: lerp(324, 267, segment(t, 0.18, 0.62)), y: 415, walking: t > 0.18 && t < 0.62, facingLeft: true });
      this.spear(rearX, 442); this.spear(frontX, 440, true);
      this.mist(0xa9bac3, 0.065);
      if (t > 0.72) this.rope(rearX + 22, 400, kingX - 15, 394);
    } else if (step === 1) {
      this.shot('forest', 'THE WHISPERING WOOD · TAKEN EAST', lerp(1.09, 1.18, t), lerp(440, 525, t), 296, 0xb6c4ca);
      const x = lerp(202, 710, t);
      const y = 441 - Math.sin(t * Math.PI) * 19;
      this.pose('guard-front', { x: x + 99, y: y - 2, walking: true });
      this.pose('king', { x, y, walking: true });
      this.pose('guard-rear', { x: x - 89, y: y + 5, walking: true });
      this.spear(x + 99, y - 2); this.spear(x - 89, y + 5);
      this.rope(x - 64, y - 35, x - 9, y - 36);
      this.rope(x + 11, y - 37, x + 75, y - 37);
      this.mist(0xc2cbb3, 0.08);
    } else if (step === 2) {
      this.shot('camp', 'THE ORC ENCAMPMENT · NO WAY OUT', lerp(1.12, 1.30, t), 588, 291, 0xa8b6bf);
      const entry = smooth(segment(t, 0, 0.70));
      const cage = this.cagePositions();
      const kingX = lerp(536, cage.king.x, entry), kingY = lerp(427, cage.king.y, entry);
      this.pose('king', { x: kingX, y: kingY, walking: t < 0.70, facingLeft: t > 0.74 });
      this.pose('guard-front', { x: lerp(651, 872, entry), y: 420, walking: t < 0.70, facingLeft: t > 0.7 });
      this.pose('guard-rear', { x: lerp(433, 616, entry), y: 437, walking: t < 0.70 });
      this.spear(lerp(433, 616, entry), 437);
      this.cage(1 - segment(t, 0.69, 0.87));
      this.mist(0x75928b, 0.045);
    } else {
      this.shot('village', 'BRAMBLEHOLLOW · A QUIETER HERO', lerp(1.07, 1.18, t), 487, 292);
      const arrive = smooth(segment(t, 0, 0.70));
      this.pose('elder', { x: 385, y: 423, speaking: true });
      const borinX = lerp(749, 485, arrive), borinY = lerp(370, 437, arrive);
      this.pose('borin', { x: borinX, y: borinY, walking: t < 0.7, facingLeft: true });
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
      const cage = this.cagePositions();
      this.pose('king', cage.king);
      const approaching = this.elapsedMs < PICKAXE_START_MS;
      const arrive = smooth(segment(this.elapsedMs, 0, PICKAXE_START_MS));
      this.pose('borin', { x: lerp(cage.strike.x - 65, cage.strike.x, arrive), y: lerp(cage.strike.y + 45, cage.strike.y, arrive),
        walking: approaching, ...(approaching ? {} : { action: 'pickaxe-back', actionElapsedMs: this.elapsedMs - PICKAXE_START_MS }) });
      this.sleepingGuard();
      this.cage(0, Math.max(0, this.elapsedMs - PICKAXE_START_MS - PICKAXE_IMPACT_MS));
      this.mist(0xe5b05b, 0.025);
    } else if (step === 1) {
      this.shot('camp', 'GOOD KNOTS · AN OPEN DOOR', lerp(1.26, 1.16, t), 570, 298);
      this.cage(1);
      const cage = this.cagePositions();
      const stepAside = smooth(segment(t, 0, .24));
      const exit = smooth(segment(t, .20, .64));
      const flee = smooth(segment(t, .72, 1));
      this.pose('king', { x: lerp(cage.king.x, cage.outside.x, exit) - flee * 146, y: lerp(cage.king.y, cage.outside.y, exit) + flee * 22,
        walking: t > .20 && t < .64 || t > .72, facing: t > .72 ? 'left' : 'down' });
      this.pose('borin', { x: lerp(lerp(cage.strike.x, cage.strike.x - 75, stepAside), cage.outside.x - 193, flee),
        y: lerp(lerp(cage.strike.y, cage.strike.y + 12, stepAside), cage.outside.y + 29, flee),
        walking: t < .24 || t > .72, facingLeft: true });
      this.sleepingGuard();
      this.mist(0xb3c4a8, 0.025);
    } else if (step === 2) {
      this.shot('forest', 'THE WHISPERING WOOD · RUN FOR HOME', lerp(1.13, 1.07, t), lerp(528, 451, t), 290);
      const x = lerp(784, 162, t), y = 445 - Math.sin(t * Math.PI) * 15;
      this.pose('borin', { x: x - 68, y, walking: true, facingLeft: true });
      this.pose('king', { x: x + 28, y: y + 3, walking: true, facingLeft: true });
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
      this.pose('borin', { x: lerp(584, 476, arrive), y: lerp(347, 435, arrive), walking: t < 0.67, facingLeft: true });
      this.pose('king', { x: lerp(661, 566, arrive), y: lerp(352, 436, arrive), walking: t < 0.67, facingLeft: true });
      this.pose('elder', { x: 359, y: 433, speaking: true });
      this.pose('innkeeper', { x: 274, y: 438 - Math.max(0, Math.sin(this.elapsedMs / 300)) * segment(t, 0.36, 0.62) * 8 });
      this.pose('miner', { x: 690, y: 441 - Math.max(0, Math.sin(this.elapsedMs / 320 + 1)) * segment(t, 0.36, 0.62) * 8 });
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
    const position = this.definitions.get('camp')?.points.find(point => point.id === GUARD_DRINK_POINT)?.position ?? { x: 220, y: 350 };
    this.pose('guard-front', { ...position, sleeping: true });
    const bob = Math.sin(this.elapsedMs / 340) * 3;
    for (let i = 0; i < 3; i++) {
      const x = position.x - 65 - i * 12, y = position.y - 45 - i * 17 + bob;
      this.props.lineStyle(2, 0xd3d8bb, 0.7 - i * 0.14).lineBetween(x, y, x + 7, y).lineBetween(x + 7, y, x, y + 7).lineBetween(x, y + 7, x + 7, y + 7);
    }
  }
}
