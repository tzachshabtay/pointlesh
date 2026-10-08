import Phaser from 'phaser';
import { AiAssetRuntime, loadAiAssets, installAiAssetDesigner, AiAssetDebugClient, aiTextureKey, aiScaledVariantTextureKey } from '@ai-game-assets/phaser';
import { DialogDesignerDebugClient } from '@dialog-designer/designer';
import { installPhaserDialogDesigner } from '@dialog-designer/phaser';
import { SceneDesignerDebugClient } from '@scene-designer/designer';
import { approachPointleshEntity, resolvePointleshPoint, findClosestReachablePath, AdventureDialog, BehaviorRegistry, CharacterController, CutsceneRunner, LocalStorageSaveStorage, SaveStore, isPointleshPrefab, pointInPolygon, pointleshAreaCapabilities, readCharacterAnimations, resolvePointleshScene, walkablePolygons, type DialogCheckpoint, type Direction, type GameState, type JSONValue, type ResolvedPointleshObject } from '@pointlesh/core';
import { PhaserAdventureLighting, PhaserAdventureObject, PhaserAdventureIcon, PhaserAdventureCursor, PhaserAdventureCharacter, PhaserAdventureNavigation, defaultNavigationFootprint, PhaserRoomCamera, installPhaserTextureScaling, installPhaserDisplayResolution, bindAdventureInput, bindAdventureSpriteInteraction, createWalkBehindOverlay, installPhaserPointleshDesigner } from '@pointlesh/phaser';
import { assertSceneManifest, type SceneDesignerManifest } from '@scene-designer/core';
import { assertDialogManifest, type DialogTurn } from '@dialog-designer/core';
import { assertManifest, selectScaledVariant } from '@ai-game-assets/core';
import { assets, atlasRooms, dialogs, roomDimensions, scenes, addChestGuesses } from './content';
import { CHEST_OPEN_DURATION_MS } from './chest-assets';
import { applyDialogChoice, combineItems, ending, finishOpeningChest, finishPouringBrew, finishGuardDrink, finishTyingGuard, guardLookingAway, hint, interact, intro, introArrivalLine, items, migrateRescueStory, newStory, roomIds, roomNames, targets, targetVisible, type ItemId, type RoomId, type StoryState } from './story';
import { createPixelActors, ForestMusic } from './sprites';
import { addForestPoints, roomEntryPointId } from './points';
import { GuardPatrol, assertGuardPatrolSnapshot, GUARD_HOME_POINT, GUARD_DRINK_POINT, type GuardPatrolSnapshot } from './guard-patrol';
import { addGuardAnimations, guardAnimationSize } from './guard-assets';
import { addRescueAssets, borinActionSize, CAGE_DOOR_ID, rescueAnimation } from './rescue-assets';
import { addIntroAssets } from './intro-assets';
import { addStealthAssets, peekAnimation, peekSize, PEEK_DOOR_OPEN, PEEK_DURATION_MS } from './stealth-assets';
import { CampStealth, assertCampStealthCheckpoint, type CampStealthCheckpoint } from './camp-stealth';
import { RoomTransitionController, activatePointleshAreas, assertRoomTransitionCheckpoint, type RoomTransitionCheckpoint } from './room-transition';
import { addDoorAssets, addForestTransitions, forestPortal, CAGE_APPROACH_AREA } from './transition-content';
import { forestDoors, doorObjectId, doorWorldAperture } from './door-layout';
import { DoorForeground } from './door-foreground';
import { addFireplaceAssets, addFireplace } from './fireplace-assets';
import { addLampAssets, addLamps } from './lamp-assets';
import { OutdoorAtmosphere } from './outdoor-atmosphere';
import { forestLighting, withForestLighting } from './environment-lighting';
import { addForestObjectAssets, updateForestInteractions, updateRescueAssetText } from './scene-content-updates';
import { inventoryAssetId, addForestInterfaceAssets } from './interface-assets';
import { addForestInventoryPrefabs, inventoryPrefabId } from './inventory-prefabs';
import { resolveInventoryItemPrefab } from '@pointlesh/core';
import type { AdventureCursorAppearance } from '@pointlesh/phaser';
import { CINEMATIC_DURATIONS, ForestCinematic, restoreCinematicElapsed, type EndingOpening } from './cinematics';
import { addBrewAssets, POUR_DURATION_MS } from './brew-assets';
import { addPortraitAssets, addCharacterPortraits, portraitCharacters } from './portrait-assets';
import { ForestDialogPortrait } from './dialog-portrait';
import { cottageDeparture } from './cinematic-paths';
import { CutsceneCrossfade } from './cutscene-crossfade';
import { addJournalAssets } from './journal-assets';
import { ForestJournal, renderJournal } from './journal';
import { captureSavePreview } from './save-preview';
import { assertInteractionManifest, syncInteractionVoiceLines, interactionTargets, sceneInteractionTarget, prefabInteractionTarget, itemInteractionColumn, verbInteractionColumn, resolveInteraction, selectInteractionSpeech, createInteractionPlaybackState, type InteractionManifest, type InteractionSpeechLine } from '@pointlesh/core';
import { installInteractionDesigner, InteractionDesignerDebugClient, type InteractionDesigner } from '@pointlesh/designer';
import { createForestInteractions } from './interactions';
import { playTitleDeparture } from './title-departure';

document.body.classList.toggle('debug-build', import.meta.env.DEV);

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
type ScreenFit = 'stretch' | 'fit';
let screenFit: ScreenFit = 'stretch';
try { if (localStorage.getItem('pointlesh.screen-fit') === 'fit') screenFit = 'fit'; } catch { /* Storage may be unavailable. */ }
function setScreenFit(value: ScreenFit) {
  screenFit = value;
  document.body.classList.toggle('game-fit', value === 'fit');
  try { localStorage.setItem('pointlesh.screen-fit', value); } catch { /* The setting still works for this session. */ }
}
setScreenFit(screenFit);
function setFullScreen(enabled: boolean) {
  document.body.classList.toggle('game-fullscreen', enabled);
  const label = enabled ? 'Exit full screen' : 'Enter full screen';
  el('fullscreen').setAttribute('aria-pressed', String(enabled));
  el('fullscreen').setAttribute('aria-label', label);
  el('fullscreen').title = `${label} (Esc)`;
  el('fullscreen-label').textContent = enabled ? 'Exit full screen' : 'Full screen';
  window.scrollTo(0, 0);
}
const button = (text: string, action: () => void) => { const node = document.createElement('button'); node.textContent = text; node.onclick = action; return node; };
const music = new ForestMusic();
// Authoring requests use the companion service; image previews use the same public files as the game.
class ForestAssetDebugClient extends AiAssetDebugClient {
  override assetUrl(file: string): string {
    if (/^(data:|blob:|https?:\/\/)/i.test(file)) return file;
    return new URL(file.replace(/^\/+/, ''), new URL(import.meta.env.BASE_URL, location.href)).href;
  }
}
let authoredScenes: SceneDesignerManifest = scenes;
let interactions: InteractionManifest;
let gameScene: ForestAdventure;
let modalOpen = false;
let modalRevision = 0;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) { el('toast').textContent = text; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el('toast').hidden = true; }, 4100); }
let modalReturnFocus: HTMLElement | null = null;
let endingModal = false;
function closeModal() {
  if (endingModal) return;
  modalRevision++;
  el('modal-backdrop').hidden = true; modalOpen = false; el('start-screen').inert = false;
  if (modalReturnFocus?.checkVisibility()) modalReturnFocus.focus();
}
function modal(title: string) {
  if (!modalOpen) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modalRevision++;
  gameScene?.clearMovementKeys(); el('start-screen').inert = !gameScene?.started;
  el('modal-backdrop').querySelector('.modal')!.classList.remove('journal-modal');
  el('modal-title').textContent = title; el('modal-body').replaceChildren(); el('modal-backdrop').hidden = false;
  modalOpen = true; el('modal-close').focus(); return el('modal-body');
}

const cutsceneDefinition = (kind: 'intro' | 'ending') => ({ id: `forest.${kind}`, version: 1, steps: (kind === 'intro' ? intro : ending).map((step, index) => ({ id: `${kind}-${index}`, ...step, durationMs: CINEMATIC_DURATIONS[kind][index] })) });
type ForestCheckpoint = { introVersion?: 2; introStep: number; endingStep: number; introElapsedMs?: number; endingElapsedMs?: number };
const arrowDirections: Record<string, { x: number; y: number }> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
const editingText = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');

class ForestAdventure extends Phaser.Scene {
  cancelTitleDeparture?: () => void;
  interactionDesigner?: InteractionDesigner;
  private interactionSound?: Phaser.Sound.BaseSound;
  private interactionPlayback = createInteractionPlaybackState();
  private interactionSpeechQueue: InteractionSpeechLine[] = [];
  started = false;
  story = newStory();
  selected?: ItemId;
  character!: CharacterController;
  actor!: Phaser.GameObjects.Sprite;
  binding!: PhaserAdventureCharacter;
  characterLighting!: PhaserAdventureLighting;
  navigation!: PhaserAdventureNavigation;
  roomCamera!: PhaserRoomCamera;
  private cameraWasEditing = false;
  background!: Phaser.GameObjects.Image;
  private roomTextureSources = new Map<RoomId, string>();
  private roomTextureRevision = 0;
  npcActors = new Map<string, { controller: CharacterController; binding: PhaserAdventureCharacter; sprite: Phaser.GameObjects.Sprite; actorName: string }>();
  guardPatrol?: GuardPatrol;
  private doorBinding?: PhaserAdventureCharacter;
  private guardCheckpoint?: GuardPatrolSnapshot;
  entitySprites = new Map<string, Phaser.GameObjects.Sprite>();
  doorForegrounds = new Map<string, DoorForeground>();
  objectTextureBindings = new Map<string, { assetId: string; binding: ReturnType<AiAssetRuntime['bindTexture']> }>();
  objectAnimations = new Map<string, PhaserAdventureObject>();
  private resolvedCache?: ReturnType<typeof resolvePointleshScene>;
  speakingVoice = 'borin';
  labels: Phaser.GameObjects.Text[] = [];
  private outdoorAtmosphere!: OutdoorAtmosphere;
  private outdoorElapsedMs = 0;
  overlays: ReturnType<typeof createWalkBehindOverlay>[] = [];
  sceneDesigner?: ReturnType<typeof installPhaserPointleshDesigner>;
  aiRuntime!: AiAssetRuntime;
  conversation = new AdventureDialog(dialogs, assets);
  conversationActive = false;
  introRunner = new CutsceneRunner(cutsceneDefinition('intro'));
  endingRunner = new CutsceneRunner(cutsceneDefinition('ending'));
  cinematic?: ForestCinematic;
  cutsceneCrossfade?: CutsceneCrossfade;
  introArrival?: 'walking' | 'speech';
  private skipIntroArrival = false;
  endingOpening?: EndingOpening;
  roomTransition!: RoomTransitionController;
  campStealth!: CampStealth;
  movementKeys = new Set<string>();
  talking = false;
  showHotspots = false;
  cursor!: PhaserAdventureCursor;
  inventoryIcons = new Map<ItemId, PhaserAdventureIcon>();
  portrait!: ForestDialogPortrait;
  cinematicPortrait!: ForestDialogPortrait;
  journal!: ForestJournal;
  hoveredTarget?: string;
  epoch = 0;
  editing = false;
  saves!: SaveStore;
  behaviors = new BehaviorRegistry<{ targetId: string; item?: ItemId }>();
  constructor() { super('forest-adventure'); }
  preload() { loadAiAssets(this, assets, { baseUrl: import.meta.env.BASE_URL }); }
  create() {
    gameScene = this;
    this.aiRuntime = new AiAssetRuntime(this, assets, { baseUrl: import.meta.env.BASE_URL });
    this.portrait = new ForestDialogPortrait(this, this.aiRuntime, el('dialog-portrait'), () => !this.started || modalOpen);
    this.cinematicPortrait = new ForestDialogPortrait(this, this.aiRuntime, el('cinematic-portrait'), () => !this.started || modalOpen);
    this.journal = new ForestJournal(this, this.aiRuntime, el('journal-notification'), el('clue-dot'));
    this.journal.reset(this.story.journal);
    this.characterLighting = new PhaserAdventureLighting(this);
    for (const room of roomIds) this.drawRoomTexture(room);
    createPixelActors(this);
    installPhaserTextureScaling(this, {
      default: 'nearest', canvas: 'auto',
      // Continuous room zoom needs smooth texel boundaries; actors retain crisp pixels.
      resolve: texture => texture.key.startsWith('room.') ? 'smooth-pixel-art' : undefined,
    });
    installPhaserDisplayResolution(this.game);
    this.background = this.add.image(0, 0, 'room.village').setOrigin(0).setDepth(-1000).setDisplaySize(this.roomSize('village').width, this.roomSize('village').height);
    this.outdoorAtmosphere = new OutdoorAtmosphere(this);
    this.character = new CharacterController({ id: 'borin', position: { x: 471, y: 462 }, speed: 165, walkStep: 16, frameDurationMs: 100, frameCount: 4, movementLinkedToAnimation: true, directions: 4 });
    this.campStealth = new CampStealth(this.character, {
      pourDurationMs: () => this.binding.animationDurationMs || POUR_DURATION_MS,
      canPour: () => guardLookingAway(this.story),
      poison: () => {
        const result = finishPouringBrew(this.story);
        if (!this.story.inventory.includes('sleepyStout')) this.selected = undefined;
        this.render();
        return result.text ?? '';
      },
      returned: message => { this.binding.sync(); this.render(); if (message) this.say(message); },
    });
    this.roomTransition = new RoomTransitionController(this.character, {
      enterRoom: portal => this.changeRoom(portal.roomId as RoomId, false, true),
      onComplete: () => {
        if (this.introArrival === 'walking') {
          this.character.face(this.authoredFacing(this.playerDefinition()!));
          this.introArrival = 'speech'; this.say(introArrivalLine);
        }
        if (this.campRestricted()) this.campStealth.start(this.character.state.position);
        else if (this.story.roomId === 'camp' && !walkablePolygons(this.resolved()).some(floor => pointInPolygon(this.character.state.position, floor))) {
          this.campStealth.start(this.character.state.position); this.campStealth.release(this.campClearance());
        }
        this.binding.sync(); this.render();
      },
      onBlocked: () => {
        if (this.introArrival === 'walking') this.introArrival = undefined;
        this.syncTransitionDoors(); this.renderNearby(); toast('That entrance is blocked. Check its transition points and corridor.');
      },
    });
    this.actor = this.add.sprite(471, 462, 'actor.borin', 4).setOrigin(0.5, 0.94);
    this.binding = new PhaserAdventureCharacter(this, this.character, this.actor, {
      autoUpdate: false, aiRuntime: this.aiRuntime, assetId: 'borin',
      lighting: () => this.playerDefinition()?.properties.receiveLighting !== false,
      authoredPose: () => { const actor = this.playerDefinition(); return actor && { id: actor.id, position: actor.position, facing: this.authoredFacing(actor) }; },
      baseScale: () => { const actor = this.playerDefinition(); return actor ? { x: actor.scaleX, y: actor.scaleY } : 2.4; },
      origin: () => { const actor = this.playerDefinition(); return actor ? { x: actor.anchorX, y: 1 - actor.anchorY } : { x: .5, y: 1 }; },
      angle: () => this.playerDefinition()?.rotation ?? 0,
      animations: () => this.peeking() ? peekAnimation(!['peek-entry', 'peek-exit'].includes(this.roomTransition.phase ?? '')) : this.campStealth.pouring ? rescueAnimation('borin', 'pour-back') : this.story.tyingGuard ? rescueAnimation('borin', 'tie-rope-back') : readCharacterAnimations(this.playerDefinition()?.properties ?? {}),
      baseSize: () => this.peeking() ? peekSize(assets.assets.borin) : borinActionSize(assets.assets.borin, !!this.story.tyingGuard || this.campStealth.pouring),
      areas: () => this.playerAreas(), camera: () => this.editing || this.worldEditorOpen() ? undefined : this.cameras.main,
    });
    this.navigation = new PhaserAdventureNavigation(this, () => this.walkables());
    this.navigation.register(this.actor, {
      kind: 'character', controller: this.character,
      properties: () => this.playerDefinition()?.properties ?? {},
      footprint: () => this.navigationFootprint(this.playerDefinition()),
    });
    this.roomCamera = new PhaserRoomCamera(this.cameras.main, { room: this.roomSize('village'), target: () => this.character.state.position });
    this.cursor = new PhaserAdventureCursor(this, this.aiRuntime, {
      assetId: 'cursor.walk',
      resolve: target => {
        if (!this.started || modalOpen || this.story.introStep < intro.length || this.story.endingStep >= 0) return undefined;
        const inventory = target.closest('#inventory button, #nearby button');
        const itemCursorBar = this.selected && target.closest('.inventory-bar');
        const dialog = target.closest('#dialog');
        if (target !== this.game.canvas && !inventory && !itemCursorBar && !dialog) return undefined;
        // Inventory stays usable while authoring; canvas editing keeps its native tools.
        if ((this.editing || this.worldEditorOpen()) && !target.closest('.inventory-bar') && !(this.selected && !this.editing)) return undefined;
        if (this.talking || dialog) return 'cursor.interact';
        return this.selected ? this.inventoryCursor(this.selected) : inventory || this.hoveredTarget ? 'cursor.interact' : 'cursor.walk';
      },
    });
    this.behaviors.register('forest.interact', { handle: context => this.applyInteraction(context.targetId, context.item) });
    this.behaviors.register('forest.rescue', { handle: () => {} });
    this.conversation.onTurn(turn => this.renderTurn(turn));
    this.saves = new SaveStore({ gameId: 'pointlesh-king-under-mountain', version: 1, storage: new LocalStorageSaveStorage(), validate: save => this.validateSave(save) });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.blocked()) return this.hover();
      const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.hover(this.hit(point.x, point.y)?.id);
    });
    bindAdventureInput(this, {
      enabled: () => !this.blocked(),
      resolve: pointer => {
        const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
        const target = this.hit(point.x, point.y);
        return {
          onInteract: () => {
            this.clearMovementKeys();
            if (target) void this.act(target.id);
            else {
              this.cursor.click();
              if (this.selected) return;
              if (this.campRestricted()) { toast('I should stay hidden by the gate until the guard is asleep.'); return; }
              this.epoch++;
              try { void this.character.walkTo(point); }
              catch (error) { toast(error instanceof Error ? error.message : String(error)); }
            }
          },
          onLook: () => { if (target) this.look(target.id); },
        };
      },
    });
    this.changeRoom('village', false);
    this.installTools();
    this.render();
    el('loading').hidden = true;
    setupControls();
    // Capture the actual opening camera and character pose, rather than a bare
    // room texture whose framing and cast would jump when the intro starts.
    const titleShot = new ForestCinematic(this, 'intro', this.aiRuntime, () => authoredScenes, this.characterLighting);
    // create() can run inside a frame that has already collected its cameras.
    this.game.events.once('postrender', () => this.game.renderer.snapshot(async image => {
      titleShot.destroy();
      const cover = this.textures.get('room.village').getSourceImage() as HTMLCanvasElement;
      const source = image instanceof HTMLImageElement ? image.src : cover.toDataURL();
      // A high-density frame can exceed CSS custom-property data URL limits.
      const titleUrl = URL.createObjectURL(await (await fetch(source)).blob());
      this.events.once('shutdown', () => URL.revokeObjectURL(titleUrl));
      const titleArt = new Image(); titleArt.src = titleUrl;
      await titleArt.decode();
      el('start-screen').style.setProperty('--start-art', `url("${titleUrl}")`);
      el('start-actions').hidden = false;
      el('start-status').textContent = 'A point-and-click adventure in the Elderwood';
      // Lay out the complete menu while hidden, including its final fonts and
      // button rows. Only the centered spinner is visible during startup.
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      el<HTMLButtonElement>('new-game').disabled = false;
      el<HTMLButtonElement>('start-load').disabled = false;
      el('start-progress').hidden = true;
      el('start-controls').setAttribute('aria-busy', 'false');
      el('start-screen').classList.remove('start-loading');
    }));
    this.showStartScreen();
    if (import.meta.env.DEV) Object.assign(window, { pointleshDemo: {
      snapshot: () => this.snapshot(),
      get manifest() { return structuredClone(authoredScenes); },
      setManifest: (manifest: SceneDesignerManifest) => { authoredScenes = manifest; this.refreshDesign(); },
      get scene() { return gameScene; }
    } });
  }
  resolved() { return this.resolvedCache ??= resolvePointleshScene(authoredScenes, this.story.roomId); }
  inventoryDefinition(id: ItemId) { return resolveInventoryItemPrefab(authoredScenes, inventoryPrefabId(id)); }
  inventoryCursor(id: ItemId): AdventureCursorAppearance {
    const item = this.inventoryDefinition(id), crosshairAssetId = item.properties.crosshairAssetId;
    return { assetId: item.assetId || inventoryAssetId(id), hotspot: item.interactionPoint, animateOnClick: item.properties.animateOnClick === true,
      ...(typeof crosshairAssetId === 'string' && crosshairAssetId ? { crosshair: { assetId: crosshairAssetId,
        animation: String(item.properties.crosshairAnimationKey ?? 'idle') } } : {}) };
  }
  roomSize(room: RoomId) {
    const definition = authoredScenes.scenes[room];
    return definition ? { width: definition.width, height: definition.height } : roomDimensions[room];
  }
  drawRoomTexture(room: RoomId, textureKey?: string) {
    const spec = atlasRooms[room], size = this.roomSize(room);
    const baseKey = this.aiRuntime.key(spec.asset);
    let key = textureKey ?? baseKey;
    if (!textureKey && baseKey === aiTextureKey(spec.asset)) {
      const asset = assets.assets[spec.asset], version = asset?.versions[asset.activeVersion];
      if (version?.scaledVariants && Object.keys(version.scaledVariants).length) {
        const density = Math.max(Number.EPSILON, this.cameras.main.zoom * (devicePixelRatio || 1) * this.game.canvas.getBoundingClientRect().width / this.scale.gameSize.width);
        const source = selectScaledVariant(asset, { width: size.width * density, height: size.height * density * (spec.row === null ? 1 : 2) }, {
          version, available: candidate => this.textures.exists(aiScaledVariantTextureKey(baseKey, candidate)),
        });
        if (source) key = aiScaledVariantTextureKey(baseKey, source);
      }
    }
    const signature = `${key}:${size.width}:${size.height}`;
    if (!textureKey && this.roomTextureSources.get(room) === signature) return;
    const source = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    // Legacy two-room sheets have a two-pixel divider in their 1330-pixel source.
    const divider = spec.row === null ? 0 : source.height * 2 / 1330;
    const frameHeight = spec.row === null ? source.height : (source.height - divider) / 2;
    // Retain a variant's native resolution until final rendering. Room dimensions,
    // masks and actor coordinates remain in authored world units.
    const pixels = key.includes('::scaled::') ? { width: source.width, height: Math.round(frameHeight) } : size;
    const roomKey = `room.${room}`;
    const texture = (this.textures.exists(roomKey) ? this.textures.get(roomKey) : this.textures.createCanvas(roomKey, pixels.width, pixels.height)) as Phaser.Textures.CanvasTexture;
    if (texture.width !== pixels.width || texture.height !== pixels.height) texture.setSize(pixels.width, pixels.height);
    texture.setSmoothPixelArt(true);
    texture.context.imageSmoothingEnabled = false;
    texture.context.clearRect(0, 0, pixels.width, pixels.height);
    texture.context.drawImage(source, 0, spec.row === null ? 0 : spec.row * (frameHeight + divider), source.width, frameHeight, 0, 0, pixels.width, pixels.height);
    texture.refresh();
    this.roomTextureRevision++;
    this.roomTextureSources.set(room, signature);
    if (this.background && this.story.roomId === room) {
      this.background.setTexture(roomKey).setDisplaySize(size.width, size.height);
      for (const overlay of this.overlays) overlay.image.setTexture(roomKey).setDisplaySize(size.width, size.height);
    }
  }
  playerDefinition() { return this.resolved().objects.find(entity => entity.kind === 'character' && entity.properties.role === 'player'); }
  playerAreas() {
    const portal = this.roomTransition?.portal;
    return activatePointleshAreas(this.resolved().areas, [
      ...(portal?.roomId === this.story.roomId ? [portal.areaId] : []),
      ...(this.story.roomId === 'camp' && (this.campRestricted() || this.campStealth?.busy || this.campStealth?.peeking) ? ['camp.transition.to-forest'] : []),
    ]);
  }
  campRestricted() { return this.story.roomId === 'camp' && !this.story.flags.guardAsleep; }
  peeking() { return this.roomTransition?.phase === 'peek-exit' || this.campRestricted() && (this.roomTransition?.phase === 'peek-entry' || !!this.campStealth?.peeking); }
  campCover() { const portal = forestPortal(authoredScenes, 'camp', 'forest'); return portal.path[portal.handoffIndex ?? portal.path.length - 1]!; }
  campClearance() {
    const floors = walkablePolygons(this.resolved()), start = floors[0]?.[0], cover = this.campCover();
    return start ? findClosestReachablePath(start, cover, floors)?.at(-1) ?? cover : cover;
  }
  walkables() { return walkablePolygons({ ...this.resolved(), areas: this.playerAreas() }); }
  navigationFootprint(object?: ResolvedPointleshObject) {
    const asset = assets.assets[object?.assetId ?? 'borin'];
    // Ground dimensions use authored world scale, independently of animation
    // resolution, frame transforms, and the area's visual perspective effect.
    return defaultNavigationFootprint(
      (asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 48) * (object?.scaleX ?? 2.4),
      (asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 64) * (object?.scaleY ?? 2.4),
      object?.kind === 'object' ? 'object' : 'character',
    );
  }
  // Editors own canvas gestures and camera navigation; the simulation keeps running.
  worldEditorOpen() { return !!document.querySelector('.ai-game-assets-in-game-designer-dock__button[aria-expanded="true"]:not([aria-label="Toggle AI asset designer"]), [aria-label="Toggle scene minimap"][aria-pressed="true"]'); }
  blocked(includeDesigner = true) { return !this.started || !!this.cutsceneCrossfade || this.roomTransition?.active || !!this.introArrival || this.campStealth?.busy || (includeDesigner && (this.worldEditorOpen() || this.editing)) || modalOpen || this.talking || !!this.story.tyingGuard || !!this.story.chestOpening || this.story.introStep < intro.length || this.story.endingStep >= 0; }
  clearMovementKeys() {
    this.movementKeys.clear();
    this.character?.setMovementDirection(null, []);
  }
  updateMovementKeys() {
    if (this.blocked() || this.campRestricted()) { this.clearMovementKeys(); return; }
    const direction = [...this.movementKeys].reduce((sum, key) => ({ x: sum.x + arrowDirections[key].x, y: sum.y + arrowDirections[key].y }), { x: 0, y: 0 });
    try { this.character.setMovementDirection(direction.x || direction.y ? direction : null); }
    catch (error) { this.clearMovementKeys(); toast(error instanceof Error ? error.message : String(error)); }
  }
  hit(x: number, y: number) { return this.resolved().areas.find(area => area.kind === 'hotspot' && area.enabled && area.closed && targetVisible(this.story, area.id) && pointInPolygon({ x, y }, area.polygon)); }
  hover(id?: string) {
    this.hoveredTarget = id;
    const target = id ? targets[this.story.roomId].find(target => target.id === id) ?? this.resolved().objects.find(object => object.properties.targetId === id) : undefined;
    el('hover-label').textContent = target ? this.selected ? `Use ${items[this.selected].name} with ${target.name}` : target.name : '';
    el('hover-label').classList.toggle('visible', !!target);
  }
  interactionEntity(targetId: string, instanceId?: string) {
    if (!targetVisible(this.story, targetId)) return undefined;
    const object = this.resolved().objects.find(entity => entity.enabled && entity.properties.interactive !== false && entity.properties.targetId === targetId && (!instanceId || entity.id === instanceId));
    if (instanceId) return object;
    // Environmental scenery can share a story action with a character, such as the king's cage.
    return this.resolved().areas.find(area => area.id === targetId && area.kind === 'hotspot' && area.enabled && area.closed && area.properties.interactive !== false) ?? object;
  }
  look(targetId: string, instanceId?: string) {
    if (this.blocked()) return;
    const entity = this.interactionEntity(targetId, instanceId);
    if (!entity) return;
    this.cursor.click(this.selected ? this.inventoryCursor(this.selected) : undefined);
    if (this.authoredInteraction(sceneInteractionTarget(this.story.roomId, entity), verbInteractionColumn('look'))) return;
    const target = targets[this.story.roomId].find(target => target.id === targetId);
    this.say(typeof entity.properties.description === 'string' ? entity.properties.description : target?.description ?? entity.name);
  }
  async act(targetId: string, instanceId?: string) {
    if (this.blocked()) return;
    this.clearMovementKeys();
    const entity = this.interactionEntity(targetId, instanceId);
    if (!entity) return;
    this.cursor.click(this.selected ? this.inventoryCursor(this.selected) : undefined);
    const selected = this.selected;
    if (this.authoredInteraction(sceneInteractionTarget(this.story.roomId, entity), selected ? itemInteractionColumn(inventoryPrefabId(selected)) : verbInteractionColumn('interact'))) return;
    // Door and approach clocks start together; the transition waits at the safe
    // inside point until the leaf is clear before crossing the sill.
    if (targets[this.story.roomId].some(target => target.id === targetId && target.exit)) { this.applyInteraction(targetId); return; }
    if (this.campRestricted()) {
      if (targetId === 'camp-exit') { this.applyInteraction(targetId); return; }
      if (targetId === 'cauldron' && selected === 'sleepyStout' && this.story.inventory.includes(selected) && !this.story.flags.stewSpiked) {
        if (!guardLookingAway(this.story)) { this.say('He is watching! Wait until he turns his back, then try the brew again.'); return; }
        const point = resolvePointleshPoint(this.resolved(), String(entity.properties.walkPointId || 'camp.walk.cauldron')).position;
        this.campStealth.poison(point, this.campClearance()); this.binding.sync(); this.renderNearby(); return;
      }
      this.say(this.story.flags.stewSpiked ? 'The stew is ready. I should keep hidden until he falls asleep.' : 'I need to keep hidden. A little sleeping draught in that cauldron could give me a chance.');
      return;
    }
    const operation = ++this.epoch;
    let arrived: boolean;
    // Named walk points take priority; legacy approach offsets remain supported.
    const livePosition = 'position' in entity ? this.entitySprites.get(entity.id) : undefined;
    try { arrived = await approachPointleshEntity(this.character, this.resolved(), entity, livePosition ? { x: livePosition.x, y: livePosition.y } : undefined); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); return; }
    const current = this.interactionEntity(targetId, instanceId);
    if (operation !== this.epoch || !current) return;
    if (!arrived) return this.say('I cannot reach that from here. There needs to be a walkable path.');
    try { await this.behaviors.dispatch(current.behaviors, { type: 'interact', payload: targetId }, { targetId, item: selected }); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  }
  applyInteraction(targetId: string, selected?: ItemId) {
    const exit = targets[this.story.roomId].find(target => target.id === targetId)?.exit;
    if (exit) {
      if (this.roomTransition.active) return;
      this.epoch++; this.clearMovementKeys(); this.hover();
      const from = forestPortal(authoredScenes, this.story.roomId, exit), to = forestPortal(authoredScenes, exit, this.story.roomId);
      const stealth = !this.story.flags.guardAsleep && (from.roomId === 'camp' || to.roomId === 'camp');
      this.campStealth.cancel();
      this.roomTransition.begin(from, to, stealth);
      // Activation can change perspective at this position. Keep the rendered
      // pose and immediate save checkpoints consistent with the new area set.
      this.binding.sync();
      this.renderNearby();
      return;
    }
    const result = interact(this.story, targetId, selected);
    if (selected && !this.story.inventory.includes(selected)) this.selected = undefined;
    if (result.room) this.changeRoom(result.room);
    if (result.dialog) { this.conversationActive = true; this.conversation.start(result.dialog); }
    if (result.action === 'tie-guard') { this.epoch++; this.character.stop(); this.character.face('up'); this.renderTyingGuard(); }
    if (result.text) this.say(result.text, result.speaker);
    if (result.ending) {
      const camera = this.cameras.main;
      this.endingOpening = { position: { ...this.character.state.position }, facing: this.character.state.facing,
        zoom: camera.zoom, x: camera.width / 2 * (1 - camera.zoom) - camera.scrollX * camera.zoom,
        y: camera.height / 2 * (1 - camera.zoom) - camera.scrollY * camera.zoom };
      this.epoch++; this.character.stop(); this.dismissSpeech(); this.renderCutscene();
    }
    this.render();
  }
  /** Only a star delegates to the existing game handler; every other state is fully data-driven. */
  authoredInteraction(row: string, column: string): boolean {
    const { cell, sourceRow } = resolveInteraction(interactions, row, column);
    if (cell?.kind === 'code') return false;
    if (cell?.kind === 'simple') {
      this.playInteractionSpeech(selectInteractionSpeech(cell, sourceRow, column, this.interactionPlayback));
    }
    return true;
  }
  private playInteractionSpeech(lines: InteractionSpeechLine[]) {
    const [line, ...remaining] = lines; if (!line) return;
    this.say(line.text); this.interactionSpeechQueue = remaining;
    const asset = assets.assets[line.lineAssetId], key = this.aiRuntime.key(line.lineAssetId);
    if (asset?.versions[asset.activeVersion]?.file && this.cache.audio.exists(key)) {
      this.interactionSound = this.sound.add(key); this.interactionSound.play();
    }
  }
  changeRoom(room: RoomId, move = true, transitioning = false) {
    if (!transitioning) this.roomTransition?.cancel();
    this.campStealth?.cancel();
    // A designer scene switch can bypass gameplay input blocking. Cancel safely;
    // the rope has not been consumed until the animation finishes.
    if (room !== 'camp') delete this.story.tyingGuard;
    if (room !== 'mine' && this.story.chestOpening) finishOpeningChest(this.story);
    this.doorBinding?.destroy(); this.doorBinding = undefined;
    if (this.guardPatrol) this.guardCheckpoint = this.guardPatrol.snapshot();
    this.guardPatrol = undefined;
    const previousRoom = this.background.texture.key.slice('room.'.length) as RoomId;
    this.clearMovementKeys();
    this.epoch++;
    this.story.roomId = room;
    this.hover();
    this.background.setTexture(`room.${room}`);
    if (move) {
      const destination = resolvePointleshScene(authoredScenes, room);
      const entryId = roomEntryPointId(room, previousRoom);
      const entry = destination.points.find(point => point.id === entryId && point.enabled);
      const spawn = destination.objects.find(object => object.properties.role === 'player')?.position ?? { x: 471, y: 465 };
      const requested = entry ? resolvePointleshPoint(destination, entryId).position : spawn;
      // Editing an entry outside the floor must not strand the arriving player.
      const arrival = findClosestReachablePath(spawn, requested, walkablePolygons(destination))?.at(-1) ?? requested;
      this.character.place(arrival, 'down');
      if (this.campRestricted()) { this.character.place(this.campCover(), 'right'); this.campStealth.start(this.campCover()); }
    }
    for (const sprite of this.entitySprites.values()) sprite.destroy(); this.entitySprites.clear(); this.npcActors.clear();
    this.outdoorElapsedMs = 0;
    const size = this.roomSize(room);
    this.outdoorAtmosphere.render(room, 0, size.width, size.height);
    if (this.editing || this.worldEditorOpen()) this.cameras.main.setZoom(1);
    this.refreshDesign(); this.render();
    this.roomCamera.snap();
    if (this.sceneDesigner && this.sceneDesigner.designer.getSceneId() !== room) this.sceneDesigner.designer.select({ type: 'scene', sceneId: room });
  }
  refreshDesign() {
    this.resolvedCache = undefined;
    const size = this.roomSize(this.story.roomId);
    this.roomCamera.setRoom(size);
    this.drawRoomTexture(this.story.roomId);
    this.background.setDisplaySize(size.width, size.height);
    for (const overlay of this.overlays) overlay.destroy(); this.overlays = [];
    for (const area of this.resolved().areas.filter(area => pointleshAreaCapabilities(area).walkBehind && area.enabled)) {
      const image = this.add.image(0, 0, `room.${this.story.roomId}`).setOrigin(0).setDisplaySize(size.width, size.height);
      this.overlays.push(createWalkBehindOverlay(this, area, image, { destroyImage: true }));
    }
    const actor = this.playerDefinition();
    if (actor) {
      for (const key of ['speed', 'walkStep', 'frameDurationMs', 'frameCount'] as const) { const value = Number(actor.properties[key]); if (Number.isFinite(value) && value > 0) this.character.config[key] = key === 'frameCount' ? Math.floor(value) : value; }
      this.character.config.movementLinkedToAnimation = actor.properties.movementLinkedToAnimation !== false;
      this.character.config.directions = actor.properties.directions === 8 ? 8 : 4;
      this.actor.setVisible(actor.enabled);
    }
    this.syncEntities(); this.binding.sync(); this.renderNearby();
    if (this.talking) this.showDialogPortrait(this.speakingVoice || 'borin', !!this.speakingVoice);
    this.drawHotspots();
  }
  syncEntities() {
    const objects = this.resolved().objects.filter(object => object.properties.role !== 'player');
    const ids = new Set(objects.map(object => object.id));
    for (const [id, sprite] of this.entitySprites) if (!ids.has(id)) { sprite.destroy(); this.entitySprites.delete(id); this.npcActors.delete(id); }
    for (const object of objects) {
      const actorName = String(object.properties.actorName ?? '');
      const pickupId = String(object.properties.pickupId ?? '');
      const asset = assets.assets[object.assetId];
      const assetTexture = asset ? this.aiRuntime.key(object.assetId) : '';
      // The loader also creates placeholders for ungenerated definitions. Keep
      // the demo's pixel art until a real version or live preview is available.
      const hasAssetTexture = !!asset && (!!asset.activeVersion || assetTexture !== aiTextureKey(object.assetId)) && this.textures.exists(assetTexture);
      const texture = hasAssetTexture ? assetTexture : object.kind === 'character' ? `actor.${actorName}` : `pickup.${pickupId}`;
      if (!this.textures.exists(texture)) {
        this.entitySprites.get(object.id)?.destroy(); this.entitySprites.delete(object.id); this.npcActors.delete(object.id);
        continue;
      }
      const current = () => this.resolved().objects.find(entity => entity.id === object.id) ?? object;
      let sprite = this.entitySprites.get(object.id);
      if (!sprite) {
        sprite = this.add.sprite(object.position.x, object.position.y, texture, hasAssetTexture ? asset.frameGrid ? 0 : undefined : object.kind === 'character' ? 4 : undefined);
        this.entitySprites.set(object.id, sprite);
        this.navigation.register(sprite, {
          kind: object.kind === 'character' ? 'character' : 'object',
          properties: () => current().properties,
          footprint: () => this.navigationFootprint(current()),
        });
        bindAdventureSpriteInteraction(sprite, {
          enabled: () => !this.blocked() && current().enabled && current().properties.interactive !== false && typeof current().properties.targetId === 'string' && targetVisible(this.story, String(current().properties.targetId)),
          onHover: hovered => this.hover(hovered ? String(current().properties.targetId) : undefined),
          onInteract: () => { void this.act(String(current().properties.targetId), current().id); },
          onLook: () => this.look(String(current().properties.targetId), current().id),
        });
        sprite.once('destroy', () => {
          this.doorForegrounds.delete(object.id);
          this.objectTextureBindings.get(object.id)?.binding.destroy();
          this.objectTextureBindings.delete(object.id);
          this.objectAnimations.get(object.id)?.destroy();
          this.objectAnimations.delete(object.id);
        });
      }
      if (object.kind === 'object') {
        if (hasAssetTexture && typeof object.properties.animationKey === 'string' && object.properties.animationKey) {
          this.objectTextureBindings.get(object.id)?.binding.destroy(); this.objectTextureBindings.delete(object.id);
          if (!this.objectAnimations.has(object.id)) this.objectAnimations.set(object.id,
            new PhaserAdventureObject(this, sprite, { aiRuntime: this.aiRuntime, object: () => {
              const object = current();
              if (object.id === 'tool-chest') return { ...object, properties: { ...object.properties, animationKey: this.story.flags.tookPickaxe ? 'empty' : 'open', animationPlaying: false, animationLoop: false } };
              return object.properties.role === 'door' ? { ...object, properties: { ...object.properties,
                animationKey: this.transitionDoorKey(object.id), animationPlaying: false, animationLoop: false } } : object;
            }, areas: () => this.resolved().areas,
              lightSurface: () => ({ image: this.background, revision: this.roomTextureRevision }) }));
        } else {
          this.objectAnimations.get(object.id)?.destroy(); this.objectAnimations.delete(object.id);
          sprite.anims.stop();
          sprite.setTexture(texture, hasAssetTexture && asset.frameGrid ? 0 : undefined);
          const previous = this.objectTextureBindings.get(object.id);
          if (previous?.assetId !== object.assetId) {
            previous?.binding.destroy(); this.objectTextureBindings.delete(object.id);
            if (asset) this.objectTextureBindings.set(object.id, { assetId: object.assetId, binding: this.aiRuntime.bindTexture(sprite, object.assetId, { setInitialTexture: false, ...(asset.frameGrid ? { frame: 0 } : {}) }) });
          }
        }
      }
      sprite.setPosition(object.position.x, object.position.y).setScale(object.scaleX, object.scaleY).setOrigin(object.anchorX, 1 - object.anchorY).setAngle(object.rotation).setDepth(object.position.y);
      const visibilityTarget = typeof object.properties.targetId === 'string' ? object.properties.targetId : pickupId;
      sprite.setVisible(object.enabled && (!visibilityTarget || targetVisible(this.story, visibilityTarget)));
      this.objectAnimations.get(object.id)?.sync();
      if (object.kind === 'character') {
        let npc = this.npcActors.get(object.id);
        if (!npc) {
          const controller = new CharacterController({ id: object.id, position: object.position, facing: this.authoredFacing(object), directions: object.properties.directions === 8 ? 8 : 4 });
          const binding = new PhaserAdventureCharacter(this, controller, sprite, {
            autoUpdate: false, aiRuntime: this.aiRuntime, assetId: object.assetId,
            lighting: () => current().properties.receiveLighting !== false,
            authoredPose: () => ({ id: current().id, position: current().position, facing: this.authoredFacing(current()) }),
            animations: () => actorName === 'guard' ? this.guardPatrol?.animations(readCharacterAnimations(current().properties)) ?? readCharacterAnimations(current().properties) : readCharacterAnimations(current().properties),
            baseScale: () => ({ x: current().scaleX, y: current().scaleY }),
            ...(actorName === 'guard' ? { baseSize: () => guardAnimationSize(assets.assets[current().assetId], this.guardPatrol?.phase === 'collapse' || this.guardPatrol?.phase === 'asleep') } : {}),
            areas: () => current().properties.ignoreScaling ? [] : activatePointleshAreas(this.resolved().areas, actorName === 'king' ? [CAGE_APPROACH_AREA] : []),
            origin: () => ({ x: current().anchorX, y: 1 - current().anchorY }),
            angle: () => current().rotation,
          });
          npc = { controller, binding, sprite, actorName }; this.npcActors.set(object.id, npc);
          this.navigation.register(sprite, {
            kind: 'character', controller,
            properties: () => current().properties,
            footprint: () => this.navigationFootprint(current()),
          });
        }
        npc.actorName = actorName;
        npc.controller.config.directions = object.properties.directions === 8 ? 8 : 4;
        for (const key of ['speed', 'walkStep'] as const) {
          const value = Number(object.properties[key]);
          if (Number.isFinite(value) && value > 0) npc.controller.config[key] = value;
        }
        npc.controller.config.movementLinkedToAnimation = object.properties.movementLinkedToAnimation !== false;
        if (actorName === 'guard' && !this.guardPatrol) {
          this.guardPatrol = new GuardPatrol(npc.controller, npc.binding, () => ({
            home: resolvePointleshPoint(this.resolved(), GUARD_HOME_POINT).position,
            drink: resolvePointleshPoint(this.resolved(), GUARD_DRINK_POINT).position,
          }), () => !!this.story.flags.stewSpiked && !this.story.flags.guardAsleep, () => {
            if (finishGuardDrink(this.story)) this.render();
          }, () => !!this.story.flags.guardBound);
          if (this.guardCheckpoint) this.guardPatrol.restore(this.guardCheckpoint);
          else this.guardPatrol.start(this.story.flags.guardAsleep);
        }
        npc.binding.sync();
      }
    }
    this.syncChest();
    this.syncDoor();
    this.syncTransitionDoors();
    this.renderTyingGuard();
  }
  private syncChest(): void {
    this.objectAnimations.get('tool-chest')?.seek(this.story.flags.chestOpen || this.story.flags.tookPickaxe ? Number.MAX_SAFE_INTEGER : this.story.chestOpening?.elapsedMs ?? 0);
  }
  private syncDoor(): void {
    const door = this.resolved().objects.find(object => object.id === CAGE_DOOR_ID);
    const sprite = door && this.entitySprites.get(door.id);
    if (!door || !sprite) { this.doorBinding?.destroy(); this.doorBinding = undefined; return; }
    if (this.doorBinding?.sprite !== sprite) {
      this.doorBinding?.destroy();
      const current = () => this.resolved().objects.find(object => object.id === CAGE_DOOR_ID) ?? door;
      this.doorBinding = new PhaserAdventureCharacter(this, new CharacterController({ id: CAGE_DOOR_ID, position: door.position }), sprite, {
        autoUpdate: false, aiRuntime: this.aiRuntime, assetId: door.assetId,
        baseScale: () => ({ x: current().scaleX, y: current().scaleY }),
        origin: () => ({ x: current().anchorX, y: 1 - current().anchorY }), angle: () => current().rotation,
        animations: () => rescueAnimation(current().assetId, 'open'),
      });
    }
    this.doorBinding.renderPose({ position: door.position, activity: 'idle', facing: 'down' }, this.story.flags.won ? Number.MAX_SAFE_INTEGER : 0, { loop: false });
  }
  private transitionDoorKey(id: string): 'open' | 'close' {
    return this.roomTransition.portal?.doorId === id && this.roomTransition.closing ? 'close' : 'open';
  }
  private syncTransitionDoors(): void {
    for (const object of this.resolved().objects.filter(object => object.properties.role === 'door')) {
      const sprite = this.entitySprites.get(object.id), animation = this.objectAnimations.get(object.id);
      const progress = object.properties.doorAlwaysOpen === true ? 1 : this.roomTransition?.portal?.doorId === object.id ? this.roomTransition.doorProgress
        : (this.campRestricted() || this.campStealth?.busy) && object.id === 'camp.door.camp' ? PEEK_DOOR_OPEN : 0;
      // Seeking shares the normal object renderer and supports live previews.
      const key = this.transitionDoorKey(object.id);
      const linked = assets.assets[object.assetId]?.linkedAnimationAssets?.[key]?.assetId;
      const clip = linked && assets.assets[linked]?.animations?.[0];
      const duration = clip ? clip.frames.reduce((sum, _frame, i) => sum + (clip.frameTimings?.[i]?.delayMs ?? 1000 / clip.frameRate), 0) : 1000;
      animation?.seek((key === 'close' ? 1 - progress : progress) * duration);
      sprite?.setDepth(-900);
      const door = forestDoors.find(door => doorObjectId(door) === object.id);
      if (sprite && door) {
        let foreground = this.doorForegrounds.get(object.id);
        if (!foreground) {
          foreground = new DoorForeground(this, sprite, door);
          this.doorForegrounds.set(object.id, foreground);
        }
        const frameArea = this.resolved().areas.find(area => area.id === `${object.id}.frame`);
        const baseline = Number(frameArea?.properties.baseline ?? Math.max(...doorWorldAperture(door).map(p => p.y)) + 5);
        // Match the frame selected by the object renderer (including reverse
        // playback), rather than independently advancing an occlusion clock.
        const index = Number(sprite.frame.name);
        foreground.sync(Number.isInteger(index) && index >= 0 && index < 8 ? index : Math.min(7, Math.floor(progress * 8)), baseline);
      }
    }
  }
  private renderTyingGuard(): void {
    if (!this.story.tyingGuard) return;
    this.binding.renderPose({ position: this.character.state.position, activity: 'idle', facing: 'up' }, this.story.tyingGuard.elapsedMs, { loop: false });
  }
  private renderPeek(): void {
    if (!this.peeking()) return;
    const entering = this.roomTransition.phase === 'peek-entry';
    const retreating = this.roomTransition.phase === 'peek-exit';
    const elapsed = retreating
      ? Math.max(0, 1 - this.roomTransition.peekElapsedMs / PEEK_DURATION_MS) * this.binding.animationDurationMs
      : entering ? this.roomTransition.peekElapsedMs : this.campStealth.elapsedMs;
    this.binding.renderPose({ position: this.character.state.position, activity: 'idle', facing: 'right' },
      elapsed, { loop: !entering && !retreating });
  }
  private renderPour(): void {
    if (!this.campStealth.pouring) return;
    this.binding.renderPose({ position: this.character.state.position, activity: 'idle', facing: 'up' }, this.campStealth.elapsedMs, { loop: false });
  }
  updateTyingGuard(deltaMs: number): void {
    if (!this.story.tyingGuard) return;
    this.story.tyingGuard.elapsedMs += deltaMs;
    this.renderTyingGuard();
    if (this.story.tyingGuard.elapsedMs < this.binding.animationDurationMs) return;
    const result = finishTyingGuard(this.story);
    if (this.selected === 'rope') this.selected = undefined;
    if (result.text) this.say(result.text);
    this.binding.sync(); this.render();
  }
  authoredFacing(object: ResolvedPointleshObject): Direction {
    const facing = object.properties.facing;
    return typeof facing === 'string' && ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'].includes(facing) ? facing as Direction : 'down';
  }
  refreshCharacterAnimations() {
    this.binding.refreshAnimation();
    for (const npc of this.npcActors.values()) npc.binding.refreshAnimation();
    this.cursor?.refresh();
    for (const icon of this.inventoryIcons.values()) icon.refresh();
    this.portrait?.refresh();
    this.cinematicPortrait?.refresh();
    this.journal?.refresh();
  }
  installTools() {
    this.sceneDesigner = installPhaserPointleshDesigner({
      scene: this, manifest: authoredScenes, aiAssets: assets, aiRuntime: this.aiRuntime,
      defaultSceneId: this.story.roomId, renderSceneObjects: false, renderSceneTileMaps: false, areaDepth: 2200,
      client: new SceneDesignerDebugClient('http://127.0.0.1:4288'),
      getSceneObject: (objectId, sceneId) => {
        if (sceneId !== this.story.roomId) return undefined;
        const object = this.resolved().objects.find(object => object.objectId === objectId);
        return object?.properties.role === 'player' ? this.actor : object ? this.entitySprites.get(object.id) : undefined;
      },
      getCharacter: (id, sceneId) => {
        if (sceneId !== this.story.roomId) return undefined;
        this.clearMovementKeys(); this.epoch++;
        return id === this.playerDefinition()?.id ? this.character : this.npcActors.get(id)?.controller;
      },
      onOpenChange: open => { this.editing = open; },
      onSceneChange: sceneId => { if (roomIds.includes(sceneId as RoomId) && this.story.roomId !== sceneId) this.changeRoom(sceneId as RoomId); },
      onManifestChange: manifest => {
        const previous = this.resolved();
        authoredScenes = manifest; this.resolvedCache = undefined;
        for (const [id, icon] of this.inventoryIcons) icon.setAsset(this.inventoryDefinition(id).assetId || inventoryAssetId(id));
        this.cursor.refresh();
        this.interactionDesigner?.refresh();
        // Eye/lock edits must not reset placements, interrupt walks or rebuild game objects.
        const gameplay = (room: ReturnType<typeof resolvePointleshScene>) => JSON.stringify({
          ...room, points: room.points.map(({ visible, ...point }) => point),
        });
        if (gameplay(previous) !== gameplay(this.resolved())) this.refreshDesign();
      }
    });
    installPhaserDialogDesigner({ scene: this, manifest: dialogs, aiAssets: assets, client: new DialogDesignerDebugClient('http://127.0.0.1:4289'), onManifestChange: manifest => {
      Object.assign(dialogs, manifest); this.conversation.setManifest(dialogs, assets); this.conversationActive = false; this.dismissSpeech();
    }, onAiAssetsChange: next => { Object.assign(assets, next); this.aiRuntime.syncManifest(assets); this.sceneDesigner?.inspector.setAiAssets(assets); this.refreshCharacterAnimations(); this.conversation.setManifest(dialogs, assets); this.conversationActive = false; this.dismissSpeech(); } });
    const callbacks = this.aiRuntime.designerCallbacks();
    const refreshAtlas = (assetId: string, textureKey: string) => {
      if (!assetId.startsWith('background.')) return;
      for (const room of roomIds.filter(room => atlasRooms[room].asset === assetId)) this.drawRoomTexture(room, textureKey);
    };
    let assetDesignerManifest: import('@ai-game-assets/core').AiAssetManifest = assets;
    installAiAssetDesigner({ scene: this, manifest: assets, autoFirstDrafts: false, generationRecoveryKey: 'pointlesh-forest', client: new ForestAssetDebugClient('http://127.0.0.1:4287'), ...callbacks,
      onPreview: (id, key, asset) => { callbacks.onPreview(id, key, asset); refreshAtlas(id, key); this.sceneDesigner?.inspector.setAiAssets({ ...assets, assets: { ...assets.assets, [id]: asset } }); this.refreshCharacterAnimations(); },
      onAssetReady: (id, key, asset) => { callbacks.onAssetReady(id, key, asset); refreshAtlas(id, key); this.sceneDesigner?.inspector.setAiAssets({ ...assets, assets: { ...assets.assets, [id]: asset } }); this.refreshCharacterAnimations(); },
      onManifestUpdated: manifest => {
        assetDesignerManifest = manifest;
        Object.assign(manifest, syncInteractionVoiceLines(interactions, manifest, interactionTargets(authoredScenes)));
        Object.assign(assets, manifest); callbacks.onManifestUpdated(manifest); this.sceneDesigner?.inspector.setAiAssets(manifest); this.refreshCharacterAnimations();
      },
    });
    this.interactionDesigner = installInteractionDesigner({
      manifest: interactions, getScenes: () => authoredScenes, getAiAssets: () => assets,
      client: new InteractionDesignerDebugClient(), storageKey: 'pointlesh.forest.interactions.draft.v1',
      onChange: (manifest, nextAssets) => {
        interactions = manifest; Object.assign(assets, nextAssets); Object.assign(assetDesignerManifest, nextAssets); callbacks.onManifestUpdated(assets);
        this.sceneDesigner?.inspector.setAiAssets(assets);
      },
    });
    this.events.once('shutdown', () => this.interactionDesigner?.destroy());
  }
  drawHotspots() {
    for (const label of this.labels) label.destroy(); this.labels = [];
    if (!this.showHotspots) return;
    for (const area of this.resolved().areas.filter(area => area.kind === 'hotspot' && area.enabled && targetVisible(this.story, area.id))) {
      const target = targets[this.story.roomId].find(target => target.id === area.id);
      if (target) this.labels.push(this.add.text(area.polygon[0].x, area.polygon[0].y - 19, target.name, { fontFamily: 'monospace', fontSize: '11px', color: '#fff0bb', backgroundColor: '#132019e8', padding: { x: 5, y: 3 } }).setDepth(2100));
    }
    for (const object of this.resolved().objects.filter(object => object.enabled && object.properties.interactive !== false && typeof object.properties.targetId === 'string')) {
      const target = targets[this.story.roomId].find(target => target.id === object.properties.targetId);
      const sprite = this.entitySprites.get(object.id);
      if (!target || !sprite?.visible || !targetVisible(this.story, target.id)) continue;
      const bounds = sprite.getBounds();
      this.labels.push(this.add.text(bounds.centerX, bounds.top - 19, target.name, { fontFamily: 'monospace', fontSize: '11px', color: '#fff0bb', backgroundColor: '#132019e8', padding: { x: 5, y: 3 } }).setOrigin(.5, 0).setDepth(2100));
    }
  }
  renderNearby() {
    el('nearby').replaceChildren();
    for (const target of targets[this.story.roomId].filter(target => targetVisible(this.story, target.id))) {
      const node = button(target.name + (target.exit ? ' ↗' : ''), () => void this.act(target.id));
      node.setAttribute('aria-label', `Interact with ${target.name}`);
      node.disabled = this.roomTransition.active || this.campStealth.busy || !this.interactionEntity(target.id);
      el('nearby').append(node);
    }
  }
  showDialogPortrait(voice: string, speaking: boolean, portrait = this.portrait) {
    const character = this.resolved().objects.find(object => object.kind === 'character' && (voice === 'borin' ? object.properties.role === 'player' : object.properties.actorName === voice));
    const prefab = !character ? Object.values(authoredScenes.prefabs ?? {}).filter(isPointleshPrefab).find(prefab => {
      const properties = prefab.pointlesh.properties;
      return prefab.pointlesh.kind === 'character' && (voice === 'borin' ? properties.role === 'player' : properties.actorName === voice);
    }) : undefined;
    const properties = character?.properties ?? prefab?.pointlesh.properties;
    if (properties) portrait.show(properties, speaking);
    else portrait.hide();
  }
  say(text: string, speaker = 'Borin') {
    this.interactionSpeechQueue = [];
    this.interactionSound?.stop(); this.interactionSound?.destroy(); this.interactionSound = undefined;
    this.epoch++; this.clearMovementKeys(); this.talking = true;
    this.speakingVoice = Object.entries(portraitCharacters).find(([id, name]) => id === speaker || name === speaker)?.[0] ?? 'borin';
    this.conversationActive = false; this.character.stop();
    if (this.speakingVoice === 'borin') void this.character.say(text, 3600000);
    else this.character.finishSpeech();
    el('dialog').hidden = false; el('speaker').textContent = speaker; el('speech').textContent = text;
    el('choices').replaceChildren(); el('dialog-next').hidden = false;
    this.showDialogPortrait(this.speakingVoice, true);
  }
  dismissSpeech() { this.interactionSpeechQueue = []; this.interactionSound?.stop(); this.interactionSound?.destroy(); this.interactionSound = undefined; this.talking = false; this.conversationActive = false; this.character.finishSpeech(); el('dialog').hidden = true; this.portrait?.hide(); }
  renderTurn(turn: DialogTurn) {
    this.clearMovementKeys();
    if (turn.type === 'end') { this.dismissSpeech(); this.render(); return; }
    this.talking = true; this.conversationActive = true;
    el('dialog').hidden = false; el('choices').replaceChildren();
    if (turn.type === 'line') {
      const voice = turn.resolved.voiceAsset.id.split('.').pop();
      this.speakingVoice = voice ?? 'borin';
      el('speaker').textContent = ({ ...portraitCharacters, chest:'Runed chest' } as Record<string,string>)[voice ?? ''] ?? 'Borin';
      el('speech').textContent = turn.resolved.text; el('dialog-next').hidden = false;
      if (voice === 'borin') void this.character.say(turn.resolved.text, 3600000);
      else this.character.finishSpeech();
      this.showDialogPortrait(this.speakingVoice, true);
    } else {
      this.speakingVoice = '';
      this.character.finishSpeech(); el('speaker').textContent = 'Borin'; el('speech').textContent = turn.decision.prompt; el('dialog-next').hidden = true;
      this.showDialogPortrait('borin', false);
      for (const option of turn.options) el('choices').append(button(option.text, () => {
        applyDialogChoice(this.story, option.id); this.conversation.choose(option.id); this.render();
      }));
    }
  }
  beginIntroArrival() {
    const departure = cottageDeparture(authoredScenes);
    const path = [...departure.path].reverse();
    this.introArrival = 'walking';
    this.roomTransition.arrive(forestPortal(authoredScenes, 'house', 'village'), {
      ...departure.portal, path, handoffIndex: path.length - 1,
    });
    this.binding.sync(); this.roomCamera.snap(); this.syncTransitionDoors(); this.renderNearby();
  }
  continueSpeech() {
    if (this.conversationActive) { this.conversation.advance(); return; }
    if (this.interactionSpeechQueue.length) { this.playInteractionSpeech(this.interactionSpeechQueue); return; }
    this.dismissSpeech();
    if (this.introArrival === 'speech') this.introArrival = undefined;
  }
  renderCutscene() {
    const isEnding = this.story.endingStep >= 0;
    const index = isEnding ? this.story.endingStep : this.story.introStep;
    const sequence = isEnding ? ending : intro;
    const runner = isEnding ? this.endingRunner : this.introRunner;
    if (runner.snapshot().stepIndex !== index) runner.restore({ cutsceneId: runner.definition.id, version: 1, stepIndex: Math.min(index, sequence.length), elapsedMs: 0 });
    el('cutscene').hidden = index >= sequence.length;
    if (index >= sequence.length) {
      if (isEnding) {
        this.cinematicPortrait.hide();
        // Keep the homecoming shot behind a terminal screen. There is no won
        // sandbox to dismiss into; Play again creates a fresh story and intro.
        if (!this.cinematic) this.cinematic = new ForestCinematic(this, 'ending', this.aiRuntime, () => authoredScenes, this.characterLighting, this.endingOpening);
        document.body.classList.add('cinematic-playing');
        this.cinematic.render(3, CINEMATIC_DURATIONS.ending[3] - 300);
        if (!endingModal) {
          const body = modal('A king home. A hero made.'); endingModal = true; el('modal-close').hidden = true;
          const p = document.createElement('p'); p.textContent = 'You brought Aldric home with a little courage, a little conversation, and an entirely unreasonable amount of stout. Thank you for playing.';
          const playAgain = button('Play again', () => this.newGame()); playAgain.className = 'primary';
          body.append(p, playAgain); playAgain.focus();
        }
        return;
      }
      if (this.cinematic && !this.cutsceneCrossfade) {
        const outgoing = this.cinematic;
        if (!this.skipIntroArrival) this.beginIntroArrival();
        this.skipIntroArrival = false;
        this.cutsceneCrossfade = new CutsceneCrossfade(this);
        this.cutsceneCrossfade.start(el('game').parentElement!, el('cinematic-portrait'), () => {
          outgoing.destroy(); this.cinematic = undefined;
          document.body.classList.remove('cinematic-playing');
          this.binding.sync(); this.roomCamera.snap();
        }, () => {
          this.cinematicPortrait.hide(); this.cutsceneCrossfade = undefined;
        });
      } else if (!this.cutsceneCrossfade) {
        this.cinematicPortrait.hide(); document.body.classList.remove('cinematic-playing'); this.binding.sync();
      }
      return;
    }
    this.cutsceneCrossfade?.destroy(); this.cutsceneCrossfade = undefined;
    const kind = isEnding ? 'ending' : 'intro';
    if (this.cinematic?.snapshot().kind !== kind) {
      this.cinematic?.destroy(); this.cinematic = new ForestCinematic(this, kind, this.aiRuntime, () => authoredScenes, this.characterLighting, this.endingOpening);
      this.clearMovementKeys(); this.character.stop(); this.hover();
    }
    document.body.classList.add('cinematic-playing');
    this.cinematic.render(index, runner.snapshot().elapsedMs);
    el('cutscene-location').textContent = this.cinematic.locationName;
    el('cutscene-kicker').textContent = isEnding ? 'THE JOURNEY HOME' : 'THE STORY BEGINS';
    const step = runner.current()!;
    const voice = Object.entries(portraitCharacters).find(([, name]) => name === step.speaker)?.[0];
    if (voice) this.showDialogPortrait(voice, true, this.cinematicPortrait);
    else this.cinematicPortrait.hide();
    el('cutscene-speaker').textContent = step.speaker ?? ''; el('cutscene-text').textContent = step.text ?? '';
    el('cutscene-progress').textContent = sequence.map((_, i) => i === index ? '◆' : '◇').join(' ');
    el('skip-intro').hidden = false;
    el('skip-intro').textContent = isEnding ? 'Skip to homecoming' : 'Skip introduction';
    el('cutscene-next').firstChild!.textContent = index === sequence.length - 1 ? isEnding ? 'Home at last ' : 'Begin adventure ' : 'Next scene ';
    el<HTMLButtonElement>('cutscene-next').disabled = false;
  }
  advanceCutscene(skip = false) {
    if (!this.cinematic) return;
    const isEnding = this.story.endingStep >= 0;
    const runner = isEnding ? this.endingRunner : this.introRunner;
    if (!isEnding) this.skipIntroArrival = skip;
    if (skip) runner.skip(); else runner.advance();
    if (isEnding) this.story.endingStep = runner.snapshot().stepIndex;
    else this.story.introStep = runner.snapshot().stepIndex;
    this.renderCutscene();
  }
  render() {
    el('room-name').textContent = roomNames[this.story.roomId];
    el('inventory-count').textContent = this.story.inventory.length ? `${this.story.inventory.length} useful ${this.story.inventory.length === 1 ? 'thing' : 'things'}` : 'Travel light.';
    for (const icon of this.inventoryIcons.values()) icon.destroy(); this.inventoryIcons.clear();
    el('inventory').replaceChildren();
    for (const id of this.story.inventory) {
      const node = button('', () => {
        // Selecting an item also previews its cursor while editing its prefab.
        if (this.blocked(false)) return;
        const row = prefabInteractionTarget(inventoryPrefabId(id));
        if (this.selected && this.selected !== id) {
          if (this.authoredInteraction(row, itemInteractionColumn(inventoryPrefabId(this.selected)))) return;
          const text = combineItems(this.story, this.selected, id); this.selected = undefined; this.say(text);
        } else {
          if (this.authoredInteraction(row, verbInteractionColumn('interact'))) return;
          this.selected = this.selected === id ? undefined : id;
        }
        this.render();
        this.cursor.refresh();
      });
      node.className = `inventory-slot${id === this.selected ? ' selected' : ''}`; node.setAttribute('aria-label', items[id].name); node.setAttribute('aria-pressed', String(id === this.selected)); node.title = items[id].description;
      node.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (!this.blocked(false) && !this.authoredInteraction(prefabInteractionTarget(inventoryPrefabId(id)), verbInteractionColumn('look'))) this.say(items[id].description);
      });
      const icon = new PhaserAdventureIcon(this, this.aiRuntime, { assetId: this.inventoryDefinition(id).assetId || inventoryAssetId(id), width: 36, height: 36, idleAnimation: 'idle', paused: () => !this.started || modalOpen });
      this.inventoryIcons.set(id, icon); node.append(icon.canvas);
      const label = document.createElement('span'); label.className = 'item-label'; label.textContent = items[id].name; node.append(label); el('inventory').append(node);
    }
    for (let i = this.story.inventory.length; i < 6; i++) { const slot = document.createElement('span'); slot.className = 'inventory-slot empty'; slot.textContent = '·'; el('inventory').append(slot); }
    el('clear-item').hidden = !this.selected; el('inventory-hint').textContent = this.selected ? `Use ${items[this.selected].name} with…` : 'A little courage goes a long way.';
    el('objective').textContent = this.story.flags.won ? 'King Aldric is home. Well done, Borin.' : this.story.flags.guardAsleep ? this.story.flags.guardBound ? 'Free the king from his cage.' : 'Tie up Grub before breaking the lock.' : 'Find the king. Bring him home.';
    this.syncEntities();
    this.renderNearby(); this.drawHotspots();
    this.journal.observe(this.story.journal);
  }
  showStartScreen() {
    this.cancelTitleDeparture?.(); this.cancelTitleDeparture = undefined;
    setFullScreen(false);
    this.journal.clearNotification();
    this.started = false; this.epoch++; this.clearMovementKeys(); this.hover();
    if (!this.roomTransition.active && !this.campStealth.busy) this.character.stop();
    closeModal(); clearTimeout(toastTimer); el('toast').hidden = true;
    if (document.body.classList.contains('tools-visible')) el('designer').click();
    document.body.classList.add('menu-open');
    el('game-header').inert = true; el('game-content').inert = true;
    el('start-screen').hidden = false; el('new-game').focus({ preventScroll: true }); window.scrollTo(0, 0);
  }
  enterGame(animateTitle = false) {
    this.cancelTitleDeparture?.(); this.cancelTitleDeparture = undefined;
    if (!this.started) setFullScreen(true);
    this.started = true; el('start-screen').hidden = !animateTitle; document.body.classList.remove('menu-open');
    el('game-header').inert = false; el('game-content').inert = animateTitle;
    this.game.canvas.setAttribute('tabindex', '-1');
    if (animateTitle) {
      this.cancelTitleDeparture = playTitleDeparture(el('start-screen'), el('game').parentElement!, () => {
        this.cancelTitleDeparture = undefined;
        el('game-content').inert = false;
        this.game.canvas.focus({ preventScroll: true });
      });
      return;
    }
    if (endingModal) el('modal-body').querySelector('button')?.focus();
    else this.game.canvas.focus({ preventScroll: true });
  }
  newGame() {
    const fromTitle = !el('start-screen').hidden;
    setFullScreen(true);
    endingModal = false; el('modal-close').hidden = false; closeModal(); this.endingOpening = undefined;
    const story = newStory();
    const actor = resolvePointleshScene(authoredScenes, story.roomId).objects.find(object => object.properties.role === 'player');
    const controller = new CharacterController({ ...this.character.config,
      position: actor?.position ?? { x: 471, y: 462 }, facing: actor ? this.authoredFacing(actor) : 'down' });
    this.restore({ roomId: story.roomId, inventory: [], flags: {}, characters: { borin: controller.snapshot() }, selectedItem: null, dialog: null,
      cutscene: { introVersion: 2, introStep: 0, endingStep: -1, introElapsedMs: 0, endingElapsedMs: 0 },
      extensions: { journal: story.journal, guardClock: 0, speech: '' } });
    this.showHotspots = false; el('hotspots').classList.remove('active'); this.drawHotspots();
    this.enterGame(fromTitle);
  }
  snapshot(): GameState {
    return { roomId: this.story.roomId, inventory: [...this.story.inventory], flags: { ...this.story.flags }, characters: { borin: this.character.snapshot() }, selectedItem: this.selected ?? null,
      dialog: this.conversationActive ? this.conversation.snapshot() as unknown as JSONValue : null,
      cutscene: { introVersion: 2, introStep: Math.min(this.story.introStep, intro.length), endingStep: this.story.endingStep, introElapsedMs: this.introRunner.snapshot().elapsedMs, endingElapsedMs: this.endingRunner.snapshot().elapsedMs },
      extensions: { journal: [...this.story.journal], guardClock: this.story.guardClock,
        interactionRotations: { ...this.interactionPlayback.rotations },
        interactionSpeechQueue: this.interactionSpeechQueue.map(line => ({ ...line })),
        ...(this.introArrival ? { introArrival: this.introArrival } : {}),
        ...(this.endingOpening ? { endingOpening: this.endingOpening as unknown as JSONValue } : {}),
        ...(this.roomTransition.active ? { roomTransition: this.roomTransition.snapshot() as unknown as JSONValue } : {}),
        ...(this.campStealth.snapshot() ? { campStealth: this.campStealth.snapshot() as unknown as JSONValue } : {}),
        ...(this.story.chestOpening ? { chestOpening: { ...this.story.chestOpening } } : {}),
        ...(this.story.tyingGuard ? { tyingGuard: { ...this.story.tyingGuard } } : {}),
        ...(this.guardPatrol || this.guardCheckpoint ? { guardPatrol: (this.guardPatrol?.snapshot() ?? this.guardCheckpoint) as unknown as JSONValue } : {}),
        speech: this.talking && !this.conversationActive ? el('speech').textContent ?? '' : '',
        speechSpeaker: this.talking && !this.conversationActive ? el('speaker').textContent ?? 'Borin' : '' } };
  }
  validateSave(save: GameState) {
    if (!roomIds.includes(save.roomId as RoomId) || !save.characters.borin || Object.keys(save.characters).length !== 1 || save.inventory.some(item => !(item in items)) || Object.values(save.flags).some(flag => typeof flag !== 'boolean')) throw new Error('Save references unknown adventure content');
    const cutscene = save.cutscene as ForestCheckpoint;
    // Older introductions had a fourth cottage shot. Version two saves keep
    // that entrance in the normal character/door checkpoints instead.
    if (!cutscene || cutscene.introVersion !== undefined && cutscene.introVersion !== 2 || !Number.isInteger(cutscene.introStep) || cutscene.introStep < 0 || cutscene.introStep > (cutscene.introVersion === 2 ? intro.length : 4) || !Number.isInteger(cutscene.endingStep) || cutscene.endingStep < -1 || cutscene.endingStep > ending.length) throw new Error('Invalid cutscene checkpoint');
    for (const kind of ['intro', 'ending'] as const) {
      const stepIndex = cutscene[`${kind}Step`];
      const elapsedMs = cutscene[`${kind}ElapsedMs`] ?? 0;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid cutscene elapsed time');
      new CutsceneRunner(cutsceneDefinition(kind)).restore({ cutsceneId: `forest.${kind}`, version: 1, stepIndex: Math.min(Math.max(0, stepIndex), (kind === 'intro' ? intro : ending).length), elapsedMs: restoreCinematicElapsed(kind, stepIndex, elapsedMs) });
    }
    if (!Array.isArray(save.extensions.journal) || !save.extensions.journal.every(line => typeof line === 'string') || typeof save.extensions.guardClock !== 'number' || save.extensions.guardClock < 0 || typeof save.extensions.speech !== 'string') throw new Error('Invalid adventure extension data');
    const rotations = save.extensions.interactionRotations, speechQueue = save.extensions.interactionSpeechQueue;
    if (rotations !== undefined && (!rotations || typeof rotations !== 'object' || Array.isArray(rotations) || Object.values(rotations).some(value => !Number.isSafeInteger(value) || Number(value) < 0))) throw new Error('Invalid interaction rotation checkpoint');
    if (speechQueue !== undefined && (!Array.isArray(speechQueue) || speechQueue.some(line => !line || typeof line !== 'object' || Array.isArray(line) || typeof line.text !== 'string' || typeof line.lineAssetId !== 'string'))) throw new Error('Invalid interaction speech checkpoint');
    const arrival = save.extensions.introArrival;
    if (arrival !== undefined && (arrival !== 'walking' && arrival !== 'speech' || save.roomId !== 'village' || cutscene.introStep < intro.length || cutscene.endingStep >= 0 || arrival === 'walking' && !save.extensions.roomTransition || arrival === 'speech' && !save.extensions.speech)) throw new Error('Invalid intro arrival checkpoint');
    if (save.extensions.guardPatrol !== undefined) assertGuardPatrolSnapshot(save.extensions.guardPatrol);
    if (save.extensions.campStealth !== undefined) {
      assertCampStealthCheckpoint(save.extensions.campStealth);
      if (save.roomId !== 'camp') throw new Error('Stealth checkpoint is outside the camp');
    }
    if (save.extensions.roomTransition !== undefined) {
      assertRoomTransitionCheckpoint(save.extensions.roomTransition);
      const transition = save.extensions.roomTransition;
      const portal = transition.phase.includes('entry') ? transition.to : transition.from;
      if (portal.roomId !== save.roomId) throw new Error('Transition checkpoint is in a different room');
      for (const portal of [transition.from, transition.to]) {
        if (!roomIds.includes(portal.roomId as RoomId) || !resolvePointleshScene(authoredScenes, portal.roomId).areas.some(area => area.id === portal.areaId)) throw new Error('Transition references missing room geometry');
      }
    }
    const opening = save.extensions.chestOpening as { elapsedMs: number } | undefined;
    const endingOpening = save.extensions.endingOpening as unknown as EndingOpening | undefined;
    if (endingOpening && (!Number.isFinite(endingOpening.position?.x) || !Number.isFinite(endingOpening.position?.y) ||
      !['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'].includes(endingOpening.facing) ||
      !Number.isFinite(endingOpening.zoom) || endingOpening.zoom <= 0 || !Number.isFinite(endingOpening.x) || !Number.isFinite(endingOpening.y))) throw new Error('Invalid ending opening pose');
    if (opening !== undefined && (!opening || !Number.isFinite(opening.elapsedMs) || opening.elapsedMs < 0 || opening.elapsedMs >= CHEST_OPEN_DURATION_MS || save.roomId !== 'mine' || !save.flags.knowsPassword || save.flags.chestOpen || save.flags.tookPickaxe)) throw new Error('Invalid chest-opening checkpoint');
    const tying = save.extensions.tyingGuard as { elapsedMs: number } | undefined;
    if (tying !== undefined && (!tying || !Number.isFinite(tying.elapsedMs) || tying.elapsedMs < 0 || save.roomId !== 'camp' || !save.flags.guardAsleep || save.flags.guardBound || !save.inventory.includes('rope'))) throw new Error('Invalid rope-tying checkpoint');
    const checkDialog = new AdventureDialog(dialogs, assets); checkDialog.restore((save.dialog ?? null) as DialogCheckpoint | null);
    const actor = new CharacterController(this.character.config); actor.restore(save.characters.borin);
  }
  restore(save: GameState) {
    this.validateSave(save);
    const conversation = new AdventureDialog(dialogs, assets); const turn = conversation.restore((save.dialog ?? null) as DialogCheckpoint | null);
    const checkpoint = save.cutscene as ForestCheckpoint;
    this.epoch++; this.clearMovementKeys(); this.dismissSpeech();
    this.skipIntroArrival = false;
    this.introArrival = save.extensions.introArrival as typeof this.introArrival;
    endingModal = false; el('modal-close').hidden = false;
    this.endingOpening = save.extensions.endingOpening as unknown as EndingOpening | undefined;
    this.cutsceneCrossfade?.destroy(); this.cutsceneCrossfade = undefined;
    this.cinematic?.destroy(); this.cinematic = undefined;
    this.story = migrateRescueStory({ roomId: save.roomId as RoomId, inventory: save.inventory as ItemId[], flags: save.flags as Record<string, boolean>, journal: save.extensions.journal as string[], guardClock: save.extensions.guardClock as number, introStep: Math.min(checkpoint.introStep, intro.length), endingStep: checkpoint.endingStep, ...(save.extensions.chestOpening ? { chestOpening: save.extensions.chestOpening as { elapsedMs: number } } : {}), ...(save.extensions.tyingGuard ? { tyingGuard: save.extensions.tyingGuard as { elapsedMs: number } } : {}) });
    this.journal.reset(this.story.journal);
    for (const kind of ['intro', 'ending'] as const) this[`${kind}Runner`].restore({ cutsceneId: `forest.${kind}`, version: 1, stepIndex: Math.min(Math.max(0, checkpoint[`${kind}Step`]), (kind === 'intro' ? intro : ending).length), elapsedMs: restoreCinematicElapsed(kind, checkpoint[`${kind}Step`], checkpoint[`${kind}ElapsedMs`] ?? 0) });
    this.selected = (save.selectedItem ?? undefined) as ItemId | undefined;
    this.guardPatrol = undefined;
    this.guardCheckpoint = save.extensions.guardPatrol as unknown as GuardPatrolSnapshot | undefined;
    this.changeRoom(this.story.roomId, false);
    this.conversation = conversation; conversation.onTurn(next => this.renderTurn(next));
    if (turn && turn.type !== 'end') this.renderTurn(turn);
    else if (save.extensions.speech) this.say(save.extensions.speech as string, typeof save.extensions.speechSpeaker === 'string' ? save.extensions.speechSpeaker : 'Borin');
    this.interactionPlayback = { rotations: { ...(save.extensions.interactionRotations as Record<string, number> ?? {}) } };
    this.interactionSpeechQueue = this.talking && !this.conversationActive ? structuredClone((save.extensions.interactionSpeechQueue ?? []) as InteractionSpeechLine[]) : [];
    // Rebuilding dialog UI may start speech. Adopt the saved pose and animation
    // phase last, then let the binding select that activity's authored clip.
    this.character.restore(save.characters.borin);
    this.roomTransition.restore((save.extensions.roomTransition ?? null) as RoomTransitionCheckpoint | null);
    this.campStealth.restore((save.extensions.campStealth ?? null) as CampStealthCheckpoint | null);
    if (this.campRestricted() && !this.roomTransition.active && !save.extensions.campStealth) this.campStealth.takeCover(this.campCover(), this.campClearance());
    if (checkpoint.introVersion === undefined && checkpoint.introStep === 3 && checkpoint.endingStep < 0 && save.roomId === 'village' && !this.roomTransition.active) this.beginIntroArrival();
    this.syncTransitionDoors();
    this.binding.sync(); this.render(); this.renderCutscene(); this.renderTyingGuard();
    this.renderPeek();
    this.renderPour();
    this.roomCamera.snap();
  }
  update(_time: number, delta: number) {
    if (!this.binding || !this.started) return;
    const cameraEditing = this.worldEditorOpen() || this.editing;
    this.roomCamera.setEnabled(!cameraEditing);
    if (this.cameraWasEditing && !cameraEditing) { this.binding.sync(); this.roomCamera.snap(); }
    this.cameraWasEditing = cameraEditing;
    if (this.blocked() && this.movementKeys.size) this.clearMovementKeys();
    if (this.cinematic && !this.cutsceneCrossfade) {
      if (!modalOpen && !this.cancelTitleDeparture) {
        const isEnding = this.story.endingStep >= 0;
        const runner = isEnding ? this.endingRunner : this.introRunner;
        const previousStep = runner.snapshot().stepIndex;
        runner.tick(Math.min(delta, 100));
        const checkpoint = runner.snapshot();
        if (isEnding) this.story.endingStep = checkpoint.stepIndex; else this.story.introStep = checkpoint.stepIndex;
        if (checkpoint.stepIndex !== previousStep) this.renderCutscene();
        else this.cinematic.render(checkpoint.stepIndex, checkpoint.elapsedMs);
      }
    }
    if (!modalOpen && this.story.chestOpening) {
      this.story.chestOpening.elapsedMs += Math.min(delta, 100);
      if (this.story.chestOpening.elapsedMs >= CHEST_OPEN_DURATION_MS) { finishOpeningChest(this.story); this.render(); }
    }
    if (!modalOpen) this.updateTyingGuard(Math.min(delta, 100));
    const paused = modalOpen || !!this.cutsceneCrossfade || !!this.story.tyingGuard || !!this.story.chestOpening || this.story.introStep < intro.length || this.story.endingStep >= 0;
    if (!paused) {
      this.binding.update(Math.min(delta, 100));
      const previousRoom = this.story.roomId;
      this.roomTransition.update(Math.min(delta, 100));
      if (!this.talking) this.campStealth.update(Math.min(delta, 100));
      if (!this.campRestricted() && this.campStealth.peeking) this.campStealth.release(this.campClearance());
      if (previousRoom !== this.story.roomId) { this.binding.sync(); this.roomCamera.snap(); }
      this.roomCamera.update(Math.min(delta, 100));
      if (!this.talking && this.story.roomId === 'camp' && !this.story.flags.guardAsleep) this.story.guardClock += Math.min(delta, 100);
    }
    for (const npc of this.npcActors.values()) {
      if (npc.actorName === 'guard' && this.guardPatrol) {
        if (this.talking && this.speakingVoice === 'guard' && !this.story.flags.guardAsleep) {
          const speech = el('speech').textContent ?? '';
          if (npc.controller.state.speech?.text !== speech) void npc.controller.say(speech, 3600000);
          if (!paused) npc.binding.update(Math.min(delta, 100));
        } else if (!paused && !this.talking) { npc.controller.finishSpeech(); this.guardPatrol.update(Math.min(delta, 100)); }
        else npc.binding.sync();
        this.story.flags.guardDistracted = this.guardPatrol.distracted;
        continue;
      }
      const speaking = this.talking && npc.actorName === this.speakingVoice;
      const speech = el('speech').textContent ?? '';
      if (speaking && npc.controller.state.speech?.text !== speech) void npc.controller.say(speech, 3600000);
      else if (!speaking) npc.controller.finishSpeech();
      if (!paused) npc.binding.update(Math.min(delta, 100));
    }
    this.drawRoomTexture(this.story.roomId);
    this.syncChest();
    this.syncDoor();
    this.syncTransitionDoors();
    this.renderTyingGuard();
    this.renderPeek();
    this.renderPour();
    if (!this.cinematic) this.characterLighting.sync(forestLighting(this.story.roomId, this.resolved().objects, id => this.entitySprites.get(id)));
    if (!modalOpen) this.outdoorElapsedMs += Math.min(delta, 100);
    const outdoorSize = this.roomSize(this.story.roomId);
    this.outdoorAtmosphere.render(this.story.roomId, this.outdoorElapsedMs, outdoorSize.width, outdoorSize.height);
  }
}

function setupControls() {
  const gameBars = Array.from(document.querySelectorAll<HTMLElement>('.scene-bar,.inventory-bar'));
  // Touch has no hover: tap an edge to reveal its bar, and tap elsewhere to hide it.
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    for (const bar of gameBars) bar.classList.toggle('touch-revealed', event.target instanceof Node && bar.contains(event.target));
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') for (const bar of gameBars) bar.classList.remove('touch-revealed');
  });
  el('new-game').onclick = () => gameScene.newGame();
  el('fullscreen').onclick = () => setFullScreen(!document.body.classList.contains('game-fullscreen'));
  el('start-load').onclick = () => saveMenu('load');
  el('menu').onclick = gameMenu;
  el('character-lighting').onclick = () => {
    const enabled = gameScene.characterLighting.enabled = !gameScene.characterLighting.enabled;
    el('character-lighting').setAttribute('aria-pressed', String(enabled));
    el('character-lighting').textContent = `Lighting ${enabled ? 'on' : 'off'}`;
  };
  el('dialog-next').onclick = () => gameScene.continueSpeech();
  el('cutscene-next').onclick = () => gameScene.advanceCutscene();
  el('skip-intro').onclick = () => gameScene.advanceCutscene(true);
  el('hotspots').onclick = () => { gameScene.showHotspots = !gameScene.showHotspots; el('hotspots').classList.toggle('active', gameScene.showHotspots); gameScene.drawHotspots(); };
  el('clear-item').onclick = () => { gameScene.selected = undefined; gameScene.render(); };
  el('hint').onclick = () => gameScene.say(hint(gameScene.story), 'A little nudge');
  el('designer').onclick = () => {
    const visible = document.body.classList.toggle('tools-visible');
    if (visible) gameScene.sceneDesigner?.designer.open();
    else { document.querySelectorAll<HTMLButtonElement>('.ai-game-assets-in-game-designer-dock__button[aria-expanded="true"], [aria-label="Toggle scene minimap"][aria-pressed="true"]').forEach(node => node.click()); gameScene.editing = false; }
  };
  el('sound').onclick = () => { const active = music.toggle(); el('sound').setAttribute('aria-pressed', String(active)); el('sound').querySelector('span')!.textContent = active ? 'Sound on' : 'Sound off'; };
  el('journal').onclick = () => {
    const body = modal('Borin’s field notes');
    el('modal-backdrop').querySelector('.modal')!.classList.add('journal-modal');
    gameScene.journal.refresh();
    renderJournal(body, gameScene.story.journal); gameScene.journal.markRead();
  };
  el('map').onclick = () => {
    const body = modal('A corner of the Elderwood'); const grid = document.createElement('div'); grid.className = 'map-grid';
    for (const id of roomIds) { const card = document.createElement('div'); card.className = 'map-room'; const image = document.createElement('img'); image.src = gameScene.textures.get(`room.${id}`).getSourceImage() instanceof HTMLCanvasElement ? (gameScene.textures.get(`room.${id}`).getSourceImage() as HTMLCanvasElement).toDataURL() : ''; image.alt = roomNames[id]; const label = document.createElement('span'); label.textContent = roomNames[id]; const sub = document.createElement('small'); sub.textContent = id === gameScene.story.roomId ? 'YOU ARE HERE' : ({ village:'Pub · Cottage · Forest',pub:'From Bramblehollow',house:'From Bramblehollow',forest:'Village · Mine · Camp',mine:'From the Whispering Wood',camp:'From the Whispering Wood' })[id]; label.append(sub); card.append(image, label); grid.append(card); } body.append(grid);
  };
  el('help').onclick = () => { const body = modal('A quieter kind of hero'); const list = document.createElement('ul'); for (const text of ['Click to walk to the nearest reachable ground, or hold the arrow keys to walk. Click or tap a person to talk, or an object to interact. Nearby buttons also interact and work with the keyboard.', 'Right-click or press and hold for half a second to look at a person, object, or hotspot. Holding works with touch, mouse, or trackpad.', 'Select an item in your satchel, then click an object to use it. Select a second inventory item to try combining them. Put away clears your selection.', 'Tab reveals hotspots. M opens the map. J opens your journal. The nudge button gives a clue for your current puzzle.', 'The animated introduction and ending play automatically. Next scene advances a shot; Skip finishes the sequence. Save and load any of three slots, even during a conversation or animation. Saves stay in this browser.', 'Designer opens the live scene editor. Draw walkable shapes, tune perspective and zoom, or edit prefab properties. Your changes affect play immediately. Run the local authoring server to promote edits to project files.']) { const li = document.createElement('li'); li.textContent = text; list.append(li); } body.append(list); };
  function gameMenu() {
    if (!gameScene.started) return;
    const body = modal('A moment on the trail');
    const actions = document.createElement('div'); actions.className = 'pause-menu';
    const save = button('Save', () => saveMenu('save')); save.id = 'save';
    const load = button('Load', () => saveMenu('load')); load.id = 'load';
    actions.append(button('Resume adventure', closeModal), save, load,
      button('Return to title', () => gameScene.showStartScreen()));
    body.append(actions);
    const display = document.createElement('label'); display.className = 'screen-fit-setting';
    const caption = document.createElement('span'); caption.textContent = 'Full-screen display';
    const select = document.createElement('select'); select.id = 'screen-fit';
    for (const [value, text] of [['stretch', 'Stretch to fill'], ['fit', 'Fit original proportions']] as const) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
    }
    select.value = screenFit;
    select.onchange = () => setScreenFit(select.value === 'fit' ? 'fit' : 'stretch');
    display.append(caption, select); body.append(display);
  }
  function saveMenu(mode: 'save' | 'load') {
    if (mode === 'save' && !gameScene.started) return;
    const body = modal(mode === 'save' ? 'Keep your place' : 'Pick up the trail');
    const revision = modalRevision;
    let saves: ReturnType<SaveStore['list']>;
    try { saves = gameScene.saves.list(); } catch (error) { toast(String(error)); return; }
    for (const slot of ['1', '2', '3']) {
      const existing = saves.find(save => save.slot === slot);
      const row = document.createElement('div'); row.className = 'slot-row';
      const preview = document.createElement('div'); preview.className = 'slot-preview';
      if (existing?.screenshot) {
        const image = document.createElement('img'); image.src = existing.screenshot; image.alt = `Saved game in slot ${slot}`;
        preview.append(image);
      } else { preview.textContent = existing ? 'No preview yet' : 'Empty slot'; }
      const label = document.createElement('span'); label.className = 'slot-label'; label.textContent = `Slot ${slot}`;
      const date = document.createElement('small'); date.textContent = existing ? new Date(existing.savedAt).toLocaleString() : 'An unwritten adventure'; label.append(date);
      const action = button(mode === 'save' ? existing ? 'Overwrite' : 'Save here' : 'Load', async () => {
        const actions = Array.from(body.querySelectorAll<HTMLButtonElement>('button'));
        const disabled = actions.map(node => node.disabled);
        try {
          if (mode === 'save') {
            actions.forEach(node => { node.disabled = true; }); action.textContent = 'Saving…';
            const state = gameScene.snapshot();
            const screenshot = await captureSavePreview(gameScene);
            if (revision !== modalRevision) return;
            gameScene.saves.save(slot, state, { screenshot }); toast(`Adventure saved in slot ${slot}.`);
          } else {
            const candidate = gameScene.saves.load(slot); if (!candidate) throw new Error('That slot is empty.');
            gameScene.restore(candidate); gameScene.enterGame(); toast('Welcome back, Borin.');
          }
          closeModal();
        } catch (error) {
          if (revision === modalRevision) toast(error instanceof Error ? error.message : String(error));
        } finally {
          if (revision === modalRevision) {
            actions.forEach((node, index) => { node.disabled = disabled[index]!; });
            action.textContent = mode === 'save' ? existing ? 'Overwrite' : 'Save here' : 'Load';
          }
        }
      });
      action.setAttribute('aria-label', `${mode} slot ${slot}`); action.disabled = mode === 'load' && !existing;
      row.append(preview, label, action); body.append(row);
    }
    if (gameScene.started) { const back = button('← Back to menu', gameMenu); back.className = 'menu-back'; body.append(back); }
  }
  el('modal-close').onclick = closeModal; el('modal-backdrop').onclick = event => { if (event.target === el('modal-backdrop')) closeModal(); };
  document.addEventListener('keydown', event => {
    if (gameScene.cancelTitleDeparture) return;
    if (editingText(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!gameScene.started) { if (event.key === 'Escape' && modalOpen) closeModal(); return; }
    if (arrowDirections[event.key]) {
      if (gameScene.blocked()) return;
      event.preventDefault();
      if (!gameScene.movementKeys.has(event.key)) {
        gameScene.epoch++; gameScene.movementKeys.add(event.key); gameScene.updateMovementKeys();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (event.repeat || event.defaultPrevented) return;
      if (modalOpen) closeModal();
      else if (gameScene.editing) gameScene.sceneDesigner?.designer.close();
      else if (!document.body.classList.contains('tools-visible')) el('fullscreen').click();
      event.preventDefault();
      return;
    }
    if (!modalOpen && !gameScene.editing) {
      if (event.key.toLowerCase() === 'm') el('map').click(); if (event.key.toLowerCase() === 'j') el('journal').click();
      if (event.key === 'Tab' && event.target === document.body) { event.preventDefault(); el('hotspots').click(); }
      if (event.key === ' ' && event.target === document.body) { event.preventDefault(); if (!el('cutscene').hidden) el('cutscene-next').click(); else if (!el('dialog').hidden && !el('dialog-next').hidden) el('dialog-next').click(); }
    }
  });
  document.addEventListener('keyup', event => {
    if (gameScene.movementKeys.delete(event.key)) gameScene.updateMovementKeys();
  });
  window.addEventListener('blur', () => gameScene.clearMovementKeys());
  document.addEventListener('visibilitychange', () => { if (document.hidden) gameScene.clearMovementKeys(); });
  document.addEventListener('focusin', event => { if (editingText(event.target)) gameScene.clearMovementKeys(); });
}

// The companion servers promote to these JSON files. Published demos use the same authored data.
for (const [name, validate] of [['assets', assertManifest], ['dialogs', assertDialogManifest], ['scenes', assertSceneManifest]] as const) {
  const response = await fetch(`${import.meta.env.BASE_URL}authoring/${name}.json`);
  if (response.ok) {
    const value = await response.json(); validate(value);
    if (name === 'scenes') authoredScenes = addForestTransitions(withForestLighting(addLamps(addFireplace(addForestPoints(updateForestInteractions(value))))));
    else Object.assign(name === 'assets' ? assets : dialogs, value);
  } else if (response.status !== 404) throw new Error(`Could not load authored ${name}: ${response.status}`);
}
addGuardAnimations(assets);
addForestObjectAssets(assets);
updateRescueAssetText(assets);
addRescueAssets(assets);
addIntroAssets(assets);
addStealthAssets(assets);
addDoorAssets(assets);
addFireplaceAssets(assets);
addLampAssets(assets);
addPortraitAssets(assets);
addJournalAssets(assets);
addForestInterfaceAssets(assets);
addForestInventoryPrefabs(authoredScenes);
addBrewAssets(assets);
addChestGuesses(dialogs, assets);
addCharacterPortraits(authoredScenes);
interactions = createForestInteractions(authoredScenes);
const interactionResponse = await fetch(`${import.meta.env.BASE_URL}authoring/interactions.json`);
if (interactionResponse.ok) { const value = await interactionResponse.json(); assertInteractionManifest(value); interactions = value; }
else if (interactionResponse.status !== 404) throw new Error(`Could not load authored interactions: ${interactionResponse.status}`);
Object.assign(assets, syncInteractionVoiceLines(interactions, assets, interactionTargets(authoredScenes)));
// Use smooth texture sampling during continuous zoom, without multisampling quad
// edges differently in the main framebuffer and the walk-behind filter framebuffer.
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 960, height: 540, antialias: true, antialiasGL: false, roundPixels: false, backgroundColor: '#1a2922', scene: ForestAdventure, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: false } });
