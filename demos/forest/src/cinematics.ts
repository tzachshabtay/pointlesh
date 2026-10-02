import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { CharacterController, pointleshAreaCapabilities, readCharacterAnimations, resolvePointleshScene, type ResolvedPointleshObject, type Point, type Direction } from '@pointlesh/core';
import { intro as introScript, ending as endingScript } from './story';
import { createWalkBehindOverlay, PhaserAdventureCharacter, PhaserAdventureObject, type PhaserAdventureLighting } from '@pointlesh/phaser';
import { forestLighting } from './environment-lighting';
import { guardAnimationSize } from './guard-assets';
import { GUARD_DRINK_POINT } from './guard-patrol';
import { borinActionSize, CAGE_DOOR_ID, PICKAXE_START_MS, PICKAXE_IMPACT_MS, rescueAnimation } from './rescue-assets';
import { INTRO_HANDS_START_MS, INTRO_SPEAR_START_MS, introActionSize, introAnimation, type IntroAction } from './intro-assets';
import { activatePointleshAreas } from './room-transition';
import { CAGE_APPROACH_AREA } from './transition-content';
import { campRescue, forestHomeward, villageHomecoming, cottageDeparture, forestMarch, villageAbduction, sampleWalk, walkLength } from './cinematic-paths';
import { forestDoors, doorObjectId, doorWorldAperture } from './door-layout';
import { DoorForeground } from './door-foreground';

export type CinematicKind = 'intro' | 'ending';
export type EndingOpening = { position: Point; facing: Direction; zoom: number; x: number; y: number };
export const CINEMATIC_DURATIONS = {
  intro: [6000, 4500, 6000, 8500],
  ending: [6200, 6200, 5600, 6500],
} as const;

/** Older saves can be partway through the former ten-second forest shot. */
export function restoreCinematicElapsed(kind: CinematicKind, step: number, elapsedMs: number): number {
  return kind === 'intro' && step === 1 && elapsedMs >= CINEMATIC_DURATIONS.intro[1] && elapsedMs < 10000
    ? CINEMATIC_DURATIONS.intro[1] - 1 : elapsedMs;
}

type CastId = 'borin' | 'king' | 'guard-front' | 'guard-rear' | 'elder' | 'innkeeper' | 'miner';
type Pose = { x: number; y: number; transitionAreas?: string[]; walking?: boolean; speaking?: boolean; facingLeft?: boolean; facing?: 'up' | 'down' | 'left' | 'right'; alpha?: number; sleeping?: boolean; action?: 'tie-rope-back' | 'pickaxe-back' | IntroAction; actionElapsedMs?: number };
type CastActor = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  assetId?: string;
  definition?: ResolvedPointleshObject;
  binding?: PhaserAdventureCharacter;
  sleeping: boolean;
  transitionAreas?: string[];
  action?: 'bound' | 'tie-rope-back' | 'pickaxe-back' | IntroAction;
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
  private ambient: { sprite: Phaser.GameObjects.Sprite; binding: PhaserAdventureObject; playing: boolean }[] = [];
  private roomDoors: { object: ResolvedPointleshObject; sprite: Phaser.GameObjects.Sprite; binding: PhaserAdventureObject; foreground: DoorForeground }[] = [];
  private rescue?: ReturnType<typeof campRescue>;
  private homeward?: ReturnType<typeof forestHomeward>;
  private homecoming?: ReturnType<typeof villageHomecoming>;
  private march?: ReturnType<typeof forestMarch>;
  private abduction?: ReturnType<typeof villageAbduction>;
  private departure?: ReturnType<typeof cottageDeparture>;
  private overlayRoom?: string;
  private readonly foreground: Phaser.GameObjects.Graphics;
  private readonly fade: Phaser.GameObjects.Rectangle;
  locationName = '';
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
    private readonly assets: AiAssetRuntime, private readonly getManifest: () => SceneDesignerManifest, private readonly lighting?: PhaserAdventureLighting,
    private readonly opening?: EndingOpening) {
    this.root = scene.add.container(0, 0).setName('pointlesh-cinematic').setDepth(5000);
    this.world = scene.add.container(0, 0);
    this.root.add(this.world);
    this.background = scene.add.image(0, 0, 'room.village').setOrigin(0).setDepth(-1000);
    this.atmosphere = scene.add.graphics().setDepth(0);
    this.props = scene.add.graphics().setDepth(850).setName('cutscene-props');
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
    this.fade = scene.add.rectangle(0, 0, W, H, 0x06100c, 1).setOrigin(0).setAlpha(0);
    this.root.add(this.fade);

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
      this.rescue = undefined; this.homeward = undefined; this.homecoming = undefined;
      this.march = undefined; this.departure = undefined; this.abduction = undefined;
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
    this.lighting?.sync(forestLighting(this.room, this.definitions.get(this.room)?.objects ?? [],
      id => this.ambient.find(light => light.sprite.name === `ambient-${id}`)?.sprite), this.world);
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
    for (const light of this.ambient) { light.binding.destroy(); light.sprite.destroy(); }
    for (const door of this.roomDoors) { door.binding.destroy(); door.sprite.destroy(); }
    this.ambient = [];
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
    this.background.setTexture(`room.${room}`).setTint(tint);
    const size = this.definitions.get(room)!;
    this.background.setDisplaySize(size.width, size.height);
    if (this.overlayRoom !== room) {
      for (const light of this.ambient) { light.binding.destroy(); light.sprite.destroy(); }
      this.ambient = [];
      for (const door of this.roomDoors) { door.binding.destroy(); door.sprite.destroy(); }
      this.roomDoors = [];
      for (const object of this.definitions.get(room)?.objects ?? []) {
        const layout = forestDoors.find(door => doorObjectId(door) === object.id);
        if (object.enabled && layout) {
          const sprite = this.scene.add.sprite(object.position.x, object.position.y, this.assets.key(object.assetId)).setName(`cutscene-door-${object.id}`);
          this.world.add(sprite);
          const binding = new PhaserAdventureObject(this.scene, sprite, { aiRuntime: this.assets, object: () => ({ ...object, properties: { ...object.properties, animationKey: 'open' } }), autoUpdate: false });
          const foreground = new DoorForeground(this.scene, sprite, layout);
          this.world.add(foreground.image);
          this.roomDoors.push({ object, sprite, binding, foreground });
        }
        if (!object.enabled || object.properties.role !== 'scenery' || !object.properties.animationKey) continue;
        const sprite = this.scene.add.sprite(object.position.x, object.position.y, this.assets.key(object.assetId)).setName(`ambient-${object.id}`);
        this.world.add(sprite);
        const binding = new PhaserAdventureObject(this.scene, sprite, { aiRuntime: this.assets, object: () => object, autoUpdate: false,
          areas: () => this.definitions.get(room)?.areas ?? [], lightSurface: () => ({ image: this.background, container: this.world }) });
        this.ambient.push({ sprite, binding, playing: object.properties.animationPlaying !== false });
      }
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
    for (const light of this.ambient) light.binding.seek(light.playing ? this.elapsedMs : 0);
    for (const door of this.roomDoors) this.roomDoor(door.object.id, door.object.properties.doorAlwaysOpen ? 1 : 0);
    this.locationName = name;
    const x = Math.max(W / (2 * zoom), Math.min(size.width - W / (2 * zoom), focusX));
    const y = Math.max(H / (2 * zoom), Math.min(size.height - H / (2 * zoom), focusY));
    this.world.setScale(zoom).setPosition(W / 2 - x * zoom, H / 2 - y * zoom);
  }

  private roomDoor(id: string, progress: number): void {
    const door = this.roomDoors.find(door => door.object.id === id);
    if (!door) return;
    const linked = this.assets.manifest.assets[door.object.assetId]?.linkedAnimationAssets?.open?.assetId;
    const clip = linked && this.assets.manifest.assets[linked]?.animations?.[0];
    const duration = clip ? clip.frames.reduce((sum, _, i) => sum + (clip.frameTimings?.[i]?.delayMs ?? 1000 / clip.frameRate), 0) : 1000;
    door.binding.seek(clamp(progress) * duration); door.sprite.setDepth(-900);
    const area = this.definitions.get(this.room)?.areas.find(area => area.id === `${id}.frame`);
    door.foreground.sync(Number(door.sprite.frame.name), Number(area?.properties.baseline ?? Math.max(...doorWorldAperture(door.foreground.door).map(p => p.y)) + 5));
  }

  private pose(id: CastId, pose: Pose): Phaser.GameObjects.Sprite {
    const actor = this.cast.get(id)!;
    actor.sleeping = pose.sleeping ?? false;
    actor.transitionAreas = pose.transitionAreas ?? [];
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
          lighting: () => actor.definition!.properties.receiveLighting !== false,
          baseScale: () => ({ x: actor.definition!.scaleX, y: actor.definition!.scaleY }),
          baseSize: () => actor.action === 'point-spear' || actor.action === 'hands-up'
            ? introActionSize(this.assets.manifest.assets[assetId], actor.action)
            : characterId === 'borin' ? borinActionSize(this.assets.manifest.assets[assetId], !!actor.action)
              : guardAnimationSize(this.assets.manifest.assets[assetId], actor.sleeping),
          areas: () => actor.definition!.properties.ignoreScaling ? [] : activatePointleshAreas(this.definitions.get(this.room)?.areas ?? [],
            this.room === 'camp' ? [CAGE_APPROACH_AREA]
              : this.kind === 'intro' && this.stepIndex === 3 && id === 'borin' ? ['village.transition.to-house'] : actor.transitionAreas ?? []),
          origin: () => ({ x: actor.definition!.anchorX, y: 1 - actor.definition!.anchorY }),
          angle: () => actor.definition!.rotation,
          animations: () => actor.action === 'point-spear' || actor.action === 'hands-up' ? introAnimation(assetId, actor.action)
            : actor.action ? rescueAnimation(assetId, actor.action) : readCharacterAnimations(actor.definition!.properties),
        });
    }
    const speaker = (this.kind === 'intro' ? introScript : endingScript)[this.stepIndex]?.speaker;
    const speaking = ({ Borin: 'borin', 'King Aldric': 'king', 'Elder Rowan': 'elder', Mara: 'innkeeper', Orrin: 'miner' } as Record<string, string>)[speaker ?? ''] === characterId;
    actor.binding.renderPose({ position: { x: pose.x, y: pose.y },
      activity: actor.action ? 'idle' : pose.walking ? 'walking' : speaking ? 'speaking' : 'idle',
      facing: pose.facing ?? (pose.facingLeft ? 'left' : pose.walking ? 'right' : 'down'),
    }, actor.sleeping ? Number.MAX_SAFE_INTEGER : pose.actionElapsedMs ?? this.elapsedMs, { loop: !actor.action });
    sprite.setVisible(true).setAlpha(pose.alpha ?? 1);
    const shadowWidth = sprite.displayWidth * (actor.action === 'point-spear' ? 120 / 320 : 1);
    shadow.setVisible(true).setPosition(pose.x, pose.y - 1).setDisplaySize(shadowWidth * .7, 10).setDepth(pose.y - 0.5).setAlpha(0.33 * (pose.alpha ?? 1));
    return sprite;
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

  private intro(step: number, t: number): void {
    if (step === 0) {
      this.shot('village', 'BRAMBLEHOLLOW · BEFORE DAWN', lerp(1.03, 1.12, t), lerp(465, 450, t), 296, 0xaebbc6);
      const paths = this.abduction ??= villageAbduction(this.authoredManifest!);
      const travelled = this.elapsedMs * .06;
      const king = sampleWalk(paths.king, travelled), kingWalking = travelled < walkLength(paths.king);
      const rear = sampleWalk(paths['guard-rear'], travelled), rearWalking = travelled < walkLength(paths['guard-rear']);
      const front = sampleWalk(paths['guard-front'], travelled), frontWalking = travelled < walkLength(paths['guard-front']);
      const elder = sampleWalk(paths.elder, walkLength(paths.elder) * segment(t, .18, .42));
      const spear = this.elapsedMs >= INTRO_SPEAR_START_MS;
      const hands = this.elapsedMs >= INTRO_HANDS_START_MS;
      this.pose('king', { ...king, facing: kingWalking ? king.facing : 'down', walking: kingWalking,
        ...(hands ? { action: 'hands-up', actionElapsedMs: this.elapsedMs - INTRO_HANDS_START_MS } : {}) });
      this.pose('guard-rear', { ...rear, walking: rearWalking, facing: rearWalking ? rear.facing : 'right',
        ...(spear ? { action: 'point-spear', actionElapsedMs: this.elapsedMs - INTRO_SPEAR_START_MS } : {}) });
      this.pose('guard-front', { ...front, walking: frontWalking, facing: frontWalking ? front.facing : 'left',
        ...(spear ? { action: 'point-spear', actionElapsedMs: this.elapsedMs - INTRO_SPEAR_START_MS } : {}) });
      this.pose('elder', { ...elder, walking: t > 0.18 && t < 0.42, facing: t < .42 ? elder.facing : 'left' });
      this.mist(0xa9bac3, 0.065);
    } else if (step === 1) {
      const path = this.march ??= forestMarch(this.authoredManifest!);
      const length = walkLength(path), spacing = Math.min(90, length / 4);
      // Cut the march sooner without speeding up the convoy to cover the whole room.
      const progress = Math.min(this.elapsedMs, CINEMATIC_DURATIONS.intro[1]) / 10000;
      const lead = spacing * 2 + (length - spacing * 2) * progress;
      const king = sampleWalk(path, lead - spacing);
      this.shot('forest', 'THE WHISPERING WOOD · TAKEN EAST', lerp(1.09, 1.18, t), king.x, 296, 0xb6c4ca);
      this.pose('guard-front', { ...sampleWalk(path, lead), walking: true });
      this.pose('king', { ...king, walking: true });
      this.pose('guard-rear', { ...sampleWalk(path, lead - spacing * 2), walking: true });
      this.mist(0xc2cbb3, 0.08);
    } else if (step === 2) {
      this.shot('camp', 'THE ORC ENCAMPMENT · NO WAY OUT', lerp(1.12, 1.30, t), 588, 291, 0xa8b6bf);
      const entry = smooth(segment(t, 0, 0.70));
      const cage = this.cagePositions();
      const kingX = lerp(536, cage.king.x, entry), kingY = lerp(427, cage.king.y, entry);
      this.pose('king', { x: kingX, y: kingY, walking: t < 0.70, facingLeft: t > 0.74 });
      this.pose('guard-front', { x: lerp(651, 872, entry), y: 420, walking: t < 0.70, facingLeft: t > 0.7 });
      this.pose('guard-rear', { x: lerp(433, 616, entry), y: 437, walking: t < 0.70 });
      this.cage(1 - segment(t, 0.69, 0.87));
      this.mist(0x75928b, 0.045);
    } else {
      this.shot('village', 'BRAMBLEHOLLOW · A QUIETER HERO', lerp(1.07, 1.18, t), 487, 292);
      const departure = this.departure ??= cottageDeparture(this.authoredManifest!);
      const length = walkLength(departure.path), openingMs = 900, walkMs = 6200;
      const travelled = length * segment(this.elapsedMs, openingMs, openingMs + walkMs);
      const clearMs = openingMs + walkMs * departure.clearDistance / length;
      this.roomDoor(departure.portal.doorId!, segment(this.elapsedMs, 0, openingMs) * (1 - segment(this.elapsedMs, clearMs, clearMs + 900)));
      this.pose('elder', { x: 385, y: 423 });
      // The closed leaf hides him until it opens; each subsequent foot position
      // follows the authored corridor and the connected village floor.
      if (this.elapsedMs >= openingMs) this.pose('borin', { ...sampleWalk(departure.path, travelled), walking: travelled < length });
      this.mist(0xa4bd8b, 0.035);
    }
  }

  private ending(step: number, t: number): void {
    if (step === 0) {
      this.shot('camp', 'THE ORC ENCAMPMENT · ONE GOOD STRIKE', lerp(1.18, 1.30, t), 585, 301);
      if (this.opening) {
        const blend = smooth(this.elapsedMs / 900);
        this.world.setPosition(lerp(this.opening.x, this.world.x, blend), lerp(this.opening.y, this.world.y, blend))
          .setScale(lerp(this.opening.zoom, this.world.scaleX, blend));
      }
      const paths = this.rescue ??= campRescue(this.authoredManifest!, this.opening?.position);
      this.pose('king', paths.release[0]!);
      const approaching = this.elapsedMs < PICKAXE_START_MS;
      const arrive = smooth(segment(this.elapsedMs, 0, PICKAXE_START_MS));
      this.pose('borin', { ...sampleWalk(paths.approach, walkLength(paths.approach) * arrive),
        walking: approaching, ...(approaching ? {} : { action: 'pickaxe-back', actionElapsedMs: this.elapsedMs - PICKAXE_START_MS }) });
      this.sleepingGuard();
      this.cage(0, Math.max(0, this.elapsedMs - PICKAXE_START_MS - PICKAXE_IMPACT_MS));
      this.mist(0xe5b05b, 0.025);
    } else if (step === 1) {
      this.shot('camp', 'GOOD KNOTS · AN OPEN DOOR', lerp(1.26, 1.16, t), 570, 298);
      this.cage(1);
      const paths = this.rescue ??= campRescue(this.authoredManifest!);
      const stepAside = smooth(segment(t, 0, .24));
      const exit = smooth(segment(t, .20, .64));
      const flee = smooth(segment(t, .72, 1));
      this.pose('king', { ...sampleWalk(t > .72 ? paths.kingEscape : paths.release,
        walkLength(t > .72 ? paths.kingEscape : paths.release) * (t > .72 ? flee : exit)),
        walking: t > .20 && t < .64 || t > .72 });
      this.pose('borin', { ...sampleWalk(t > .72 ? paths.borinEscape : paths.aside,
        walkLength(t > .72 ? paths.borinEscape : paths.aside) * (t > .72 ? flee : stepAside)),
        walking: t < .24 || t > .72 });
      this.sleepingGuard();
      this.mist(0xb3c4a8, 0.025);
    } else if (step === 2) {
      const homeward = this.homeward ??= forestHomeward(this.authoredManifest!);
      const path = homeward.path, length = walkLength(path);
      const separation = Math.min(96, length / 3), travelled = t * length;
      const borin = sampleWalk(path, travelled + separation), king = sampleWalk(path, travelled);
      this.shot('forest', 'THE WHISPERING WOOD · RUN FOR HOME', lerp(1.13, 1.07, t), (borin.x + king.x) / 2, 290);
      // The rescue has already opened the gate. Shut it only after Aldric clears it.
      if (homeward.entry.doorId) this.roomDoor(homeward.entry.doorId,
        1 - segment(travelled, homeward.entryClearDistance, homeward.entryClearDistance + 60));
      const transitionAreas = (distance: number) => distance <= homeward.entryClearDistance ? [homeward.entry.areaId]
        : distance >= homeward.exitStartDistance ? [homeward.exit.areaId] : [];
      this.pose('borin', { ...borin, walking: travelled + separation < length, transitionAreas: transitionAreas(travelled + separation) });
      this.pose('king', { ...king, walking: travelled < length, transitionAreas: transitionAreas(travelled) });
      this.mist(0xc3cead, 0.05);
      // Fireflies and wind-blown leaves make the escape read as continuous motion.
      for (let i = 0; i < 13; i++) {
        const leafX = (i * 107 + this.elapsedMs * 0.055) % 1020 - 30;
        const leafY = 94 + (i * 31) % 218 + Math.sin(this.elapsedMs / 430 + i) * 15;
        this.foreground.fillStyle(i % 2 ? 0xcaa65c : 0x8eaa65, 0.65).fillRect(leafX, leafY, 5, 2);
      }
    } else {
      const paths = this.homecoming ??= villageHomecoming(this.authoredManifest!);
      this.shot('village', 'BRAMBLEHOLLOW · HOME AGAIN', lerp(1.15, 1.04, t), 482, 290, 0xfff4d9);
      const length = Math.max(walkLength(paths.borin), walkLength(paths.king)), separation = 70;
      const travelled = smooth(segment(t, 0, .78)) * (length + separation);
      this.pose('borin', { ...sampleWalk(paths.borin, travelled), walking: travelled > 0 && travelled < walkLength(paths.borin),
        transitionAreas: travelled <= paths.entryClearDistance ? [paths.portal.areaId] : [] });
      const kingDistance = travelled - separation;
      const kingPose = sampleWalk(paths.king, kingDistance);
      this.pose('king', { ...kingPose, facing: kingDistance >= walkLength(paths.king) ? 'down' : kingPose.facing,
        walking: kingDistance > 0 && kingDistance < walkLength(paths.king),
        transitionAreas: travelled - separation <= paths.entryClearDistance ? [paths.portal.areaId] : [] });
      this.pose('elder', { x: 359, y: 433 });
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
