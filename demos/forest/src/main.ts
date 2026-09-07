import Phaser from 'phaser';
import { AiAssetRuntime, loadAiAssets, installAiAssetDesigner, AiAssetDebugClient } from '@ai-game-assets/phaser';
import { DialogDesignerDebugClient } from '@dialog-designer/designer';
import { installPhaserDialogDesigner } from '@dialog-designer/phaser';
import { SceneDesignerDebugClient } from '@scene-designer/designer';
import { AdventureDialog, BehaviorRegistry, CharacterController, CutsceneRunner, LocalStorageSaveStorage, SaveStore, pointInPolygon, resolvePointleshScene, walkablePolygons, type DialogCheckpoint, type GameState, type JSONValue } from '@pointlesh/core';
import { PhaserAdventureCharacter, createWalkBehindOverlay, installPhaserPointleshDesigner } from '@pointlesh/phaser';
import { assertSceneManifest, type SceneDesignerManifest } from '@scene-designer/core';
import { assertDialogManifest, type DialogTurn } from '@dialog-designer/core';
import { assertManifest } from '@ai-game-assets/core';
import { assets, atlasRooms, dialogs, scenes } from './content';
import { applyDialogChoice, combineItems, ending, guardLookingAway, hint, interact, intro, items, newStory, roomIds, roomNames, targets, targetVisible, type ItemId, type RoomId, type StoryState } from './story';
import { createPixelActors, ForestMusic } from './sprites';
import { CINEMATIC_DURATIONS, ForestCinematic } from './cinematics';
import './style.css';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
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
let gameScene: ForestAdventure;
let modalOpen = false;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) { el('toast').textContent = text; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el('toast').hidden = true; }, 4100); }
function closeModal() { el('modal-backdrop').hidden = true; modalOpen = false; }
function modal(title: string) { gameScene?.clearMovementKeys(); el('modal-title').textContent = title; el('modal-body').replaceChildren(); el('modal-backdrop').hidden = false; modalOpen = true; el('modal-close').focus(); return el('modal-body'); }

const cutsceneDefinition = (kind: 'intro' | 'ending') => ({ id: `forest.${kind}`, version: 1, steps: (kind === 'intro' ? intro : ending).map((step, index) => ({ id: `${kind}-${index}`, ...step, durationMs: CINEMATIC_DURATIONS[kind][index] })) });
type ForestCheckpoint = { introStep: number; endingStep: number; introElapsedMs?: number; endingElapsedMs?: number };
const arrowDirections: Record<string, { x: number; y: number }> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
const editingText = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');

class ForestAdventure extends Phaser.Scene {
  story = newStory();
  selected?: ItemId;
  character!: CharacterController;
  actor!: Phaser.GameObjects.Sprite;
  binding!: PhaserAdventureCharacter;
  background!: Phaser.GameObjects.Image;
  npcs: Phaser.GameObjects.Sprite[] = [];
  entitySprites = new Map<string, Phaser.GameObjects.Sprite>();
  speakingVoice = 'borin';
  labels: Phaser.GameObjects.Text[] = [];
  markers!: Phaser.GameObjects.Graphics;
  stars: { image: Phaser.GameObjects.Arc; speed: number; start: number }[] = [];
  overlays: ReturnType<typeof createWalkBehindOverlay>[] = [];
  sceneDesigner?: ReturnType<typeof installPhaserPointleshDesigner>;
  aiRuntime!: AiAssetRuntime;
  conversation = new AdventureDialog(dialogs, assets);
  conversationActive = false;
  introRunner = new CutsceneRunner(cutsceneDefinition('intro'));
  endingRunner = new CutsceneRunner(cutsceneDefinition('ending'));
  cinematic?: ForestCinematic;
  movementKeys = new Set<string>();
  talking = false;
  showHotspots = false;
  epoch = 0;
  editing = false;
  saves!: SaveStore;
  behaviors = new BehaviorRegistry<{ targetId: string; item?: ItemId }>();
  constructor() { super('forest-adventure'); }
  preload() { loadAiAssets(this, assets, { baseUrl: import.meta.env.BASE_URL }); }
  create() {
    gameScene = this;
    this.aiRuntime = new AiAssetRuntime(this, assets, { baseUrl: import.meta.env.BASE_URL });
    for (const room of roomIds) {
      const spec = atlasRooms[room];
      const source = this.textures.get(this.aiRuntime.key(spec.asset)).getSourceImage() as HTMLImageElement;
      const texture = this.textures.createCanvas(`room.${room}`, 960, 540)!;
      texture.context.imageSmoothingEnabled = false;
      texture.context.drawImage(source, 0, spec.row * 666, 1182, 664, 0, 0, 960, 540); texture.refresh();
    }
    createPixelActors(this);
    this.background = this.add.image(0, 0, 'room.village').setOrigin(0).setDepth(-1000);
    this.character = new CharacterController({ id: 'borin', position: { x: 471, y: 462 }, speed: 165, walkStep: 16, frameDurationMs: 100, frameCount: 4, movementLinkedToAnimation: true, directions: 4 });
    this.actor = this.add.sprite(471, 462, 'actor.borin', 4).setOrigin(0.5, 0.94);
    this.binding = new PhaserAdventureCharacter(this, this.character, this.actor, { autoUpdate: false, baseScale: 2.4, flipLeft: true, areas: () => this.resolved().areas, camera: this.cameras.main, frame: state => state.activity === 'walking' ? state.animationFrame % 4 : state.activity === 'speaking' ? 6 + Math.floor(this.time.now / 180) % 2 : 4 + Math.floor(this.time.now / 650) % 2 });
    this.markers = this.add.graphics().setDepth(2000);
    this.behaviors.register('forest.interact', { handle: context => this.applyInteraction(context.targetId, context.item) });
    this.behaviors.register('forest.rescue', { handle: () => {} });
    this.conversation.onTurn(turn => this.renderTurn(turn));
    this.saves = new SaveStore({ gameId: 'pointlesh-king-under-mountain', version: 1, storage: new LocalStorageSaveStorage(), validate: save => this.validateSave(save) });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.blocked()) return this.hover();
      const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.hover(this.hit(point.x, point.y)?.id);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.blocked()) return;
      this.clearMovementKeys();
      const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const target = this.hit(point.x, point.y);
      if (target) void this.act(target.id);
      else if (!this.selected) {
        this.epoch++;
        try { void this.character.walkTo(point, this.walkables()); }
        catch (error) { toast(error instanceof Error ? error.message : String(error)); }
      }
    });
    this.changeRoom('village', false);
    this.installTools();
    this.render(); this.renderCutscene();
    el('loading').hidden = true;
    setupControls();
    if (new URLSearchParams(location.search).get('designer') === '1') {
      this.advanceCutscene(true);
      el('designer').click();
    }
    if (import.meta.env.DEV) Object.assign(window, { pointleshDemo: {
      snapshot: () => this.snapshot(),
      get manifest() { return structuredClone(authoredScenes); },
      setManifest: (manifest: SceneDesignerManifest) => { authoredScenes = manifest; this.refreshDesign(); },
      get scene() { return gameScene; }
    } });
  }
  resolved() { return resolvePointleshScene(authoredScenes, this.story.roomId); }
  walkables() { return walkablePolygons(this.resolved()); }
  toolsOpen() { return !!document.querySelector('.ai-game-assets-in-game-designer-dock__button[aria-expanded="true"]'); }
  blocked() { return this.toolsOpen() || this.editing || modalOpen || this.talking || this.story.introStep < intro.length || this.story.endingStep >= 0; }
  clearMovementKeys() {
    this.movementKeys.clear();
    this.character?.setMovementDirection(null, []);
  }
  updateMovementKeys() {
    if (this.blocked()) { this.clearMovementKeys(); return; }
    const direction = [...this.movementKeys].reduce((sum, key) => ({ x: sum.x + arrowDirections[key].x, y: sum.y + arrowDirections[key].y }), { x: 0, y: 0 });
    try { this.character.setMovementDirection(direction.x || direction.y ? direction : null, this.walkables()); }
    catch (error) { this.clearMovementKeys(); toast(error instanceof Error ? error.message : String(error)); }
  }
  hit(x: number, y: number) { return this.resolved().areas.find(area => area.kind === 'hotspot' && area.enabled && area.closed && targetVisible(this.story, area.id) && pointInPolygon({ x, y }, area.polygon)); }
  hover(id?: string) {
    const target = targets[this.story.roomId].find(target => target.id === id);
    el('hover-label').textContent = target ? this.selected ? `Use ${items[this.selected].name} with ${target.name}` : target.name : '';
    el('hover-label').classList.toggle('visible', !!target);
    this.game.canvas.style.cursor = target ? 'pointer' : 'crosshair';
  }
  async act(targetId: string) {
    if (this.blocked()) return;
    this.clearMovementKeys();
    const entity = this.resolved().areas.find(area => area.id === targetId && area.kind === 'hotspot' && area.enabled);
    if (!entity || !targetVisible(this.story, targetId)) return;
    const selected = this.selected;
    const operation = ++this.epoch;
    const center = entity.polygon.reduce((sum, point) => ({ x: sum.x + point.x / entity.polygon.length, y: sum.y + point.y / entity.polygon.length }), { x: 0, y: 0 });
    let arrived: boolean;
    try { arrived = await this.character.approach({ position: center, walkPoint: { x: Number(entity.properties.approachX), y: Number(entity.properties.approachY) } }, 'walk', this.walkables()); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); return; }
    if (operation !== this.epoch) return;
    if (!arrived) return this.say('I cannot reach that from here. There needs to be a walkable path.');
    try { await this.behaviors.dispatch(entity.behaviors, { type: 'interact', payload: targetId }, { targetId, item: selected }); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  }
  applyInteraction(targetId: string, selected?: ItemId) {
    const result = interact(this.story, targetId, selected);
    if (selected && !this.story.inventory.includes(selected)) this.selected = undefined;
    if (result.room) this.changeRoom(result.room);
    if (result.dialog) { this.conversationActive = true; this.conversation.start(result.dialog); }
    if (result.text) this.say(result.text);
    if (result.ending) { this.epoch++; this.character.stop(); this.renderCutscene(); }
    this.render();
  }
  changeRoom(room: RoomId, move = true) {
    this.clearMovementKeys();
    this.epoch++;
    this.story.roomId = room;
    this.background.setTexture(`room.${room}`);
    if (move) this.character.place({ x: room === 'camp' ? 160 : 471, y: 465 }, 'down');
    for (const sprite of this.entitySprites.values()) sprite.destroy(); this.entitySprites.clear(); this.npcs = [];
    for (const star of this.stars) star.image.destroy(); this.stars = [];
    if (['forest', 'village', 'camp'].includes(room)) for (let i = 0; i < 17; i++) this.stars.push({ image: this.add.circle(70 + (i * 137) % 835, 65 + (i * 61) % 370, i % 3 === 0 ? 1.8 : 1, 0xebd98a, 0.45).setDepth(1000), speed: .5 + i % 4 * .13, start: i * 27 });
    this.refreshDesign(); this.render();
    if (this.sceneDesigner && this.sceneDesigner.designer.getSceneId() !== room) this.sceneDesigner.designer.select({ type: 'scene', sceneId: room });
  }
  refreshDesign() {
    if (this.editing || this.toolsOpen()) { this.epoch++; this.character.stop(); }
    for (const overlay of this.overlays) overlay.destroy(); this.overlays = [];
    for (const area of this.resolved().areas.filter(area => area.kind === 'walk-behind' && area.enabled)) {
      const image = this.add.image(0, 0, `room.${this.story.roomId}`).setOrigin(0);
      this.overlays.push(createWalkBehindOverlay(this, area, image, { destroyImage: true }));
    }
    const actor = this.resolved().objects.find(entity => entity.kind === 'character' && entity.properties.role === 'player');
    if (actor) {
      for (const key of ['speed', 'walkStep', 'frameDurationMs', 'frameCount'] as const) { const value = Number(actor.properties[key]); if (Number.isFinite(value) && value > 0) this.character.config[key] = key === 'frameCount' ? Math.floor(value) : value; }
      this.character.config.movementLinkedToAnimation = actor.properties.movementLinkedToAnimation !== false;
      if (this.editing) this.character.place(actor.position);
      this.actor.setVisible(actor.enabled);
    }
    this.syncEntities(); this.binding.sync();
    this.drawHotspots();
  }
  syncEntities() {
    const objects = this.resolved().objects.filter(object => object.properties.role !== 'player');
    const ids = new Set(objects.map(object => object.id));
    for (const [id, sprite] of this.entitySprites) if (!ids.has(id)) { sprite.destroy(); this.entitySprites.delete(id); }
    this.npcs = [];
    for (const object of objects) {
      const actorName = String(object.properties.actorName ?? '');
      const pickupId = String(object.properties.pickupId ?? '');
      const texture = object.kind === 'character' ? `actor.${actorName}` : `pickup.${pickupId}`;
      if (!this.textures.exists(texture)) continue;
      let sprite = this.entitySprites.get(object.id);
      if (!sprite) { sprite = this.add.sprite(object.position.x, object.position.y, texture, object.kind === 'character' ? 4 : undefined); this.entitySprites.set(object.id, sprite); }
      sprite.setPosition(object.position.x, object.position.y).setScale(object.scaleX, object.scaleY).setOrigin(object.anchorX, 1 - object.anchorY).setAngle(object.rotation).setDepth(object.position.y);
      sprite.setVisible(object.enabled && (!pickupId || targetVisible(this.story, pickupId)));
      if (object.kind === 'character') this.npcs.push(sprite);
    }
  }
  installTools() {
    this.sceneDesigner = installPhaserPointleshDesigner({
      scene: this, manifest: authoredScenes, aiAssets: assets, aiRuntime: this.aiRuntime,
      defaultSceneId: this.story.roomId, renderSceneObjects: false, renderSceneTileMaps: false, areaDepth: 2200, minimap: false,
      client: new SceneDesignerDebugClient('http://127.0.0.1:4288'),
      onOpenChange: open => { this.editing = open; this.clearMovementKeys(); this.character.stop(); this.epoch++; },
      onSceneChange: sceneId => { if (roomIds.includes(sceneId as RoomId) && this.story.roomId !== sceneId) this.changeRoom(sceneId as RoomId); },
      onManifestChange: manifest => { authoredScenes = manifest; this.refreshDesign(); }
    });
    installPhaserDialogDesigner({ scene: this, manifest: dialogs, aiAssets: assets, client: new DialogDesignerDebugClient('http://127.0.0.1:4289'), onManifestChange: manifest => {
      Object.assign(dialogs, manifest); this.conversation.setManifest(dialogs, assets); this.conversationActive = false; this.dismissSpeech();
    }, onAiAssetsChange: next => { Object.assign(assets, next); this.conversation.setManifest(dialogs, assets); this.conversationActive = false; this.dismissSpeech(); } });
    const callbacks = this.aiRuntime.designerCallbacks();
    const refreshAtlas = (assetId: string, textureKey: string) => {
      if (!assetId.startsWith('background.')) return;
      const source = this.textures.get(textureKey).getSourceImage() as HTMLImageElement;
      for (const room of roomIds.filter(room => atlasRooms[room].asset === assetId)) {
        const texture = this.textures.get(`room.${room}`) as Phaser.Textures.CanvasTexture;
        texture.context.clearRect(0, 0, 960, 540);
        const divider = source.height * 2 / 1330;
        const frameHeight = (source.height - divider) / 2;
        texture.context.drawImage(source, 0, atlasRooms[room].row * (frameHeight + divider), source.width, frameHeight, 0, 0, 960, 540); texture.refresh();
      }
    };
    installAiAssetDesigner({ scene: this, manifest: assets, autoFirstDrafts: false, client: new ForestAssetDebugClient('http://127.0.0.1:4287'), ...callbacks,
      onPreview: (id, key, asset) => { callbacks.onPreview(id, key, asset); refreshAtlas(id, key); },
      onAssetReady: (id, key, asset) => { callbacks.onAssetReady(id, key, asset); refreshAtlas(id, key); }
    });
  }
  drawHotspots() {
    this.markers.clear(); for (const label of this.labels) label.destroy(); this.labels = [];
    if (!this.showHotspots) return;
    for (const area of this.resolved().areas.filter(area => area.kind === 'hotspot' && area.enabled && targetVisible(this.story, area.id))) {
      this.markers.lineStyle(1.5, 0xe9d596, .8).fillStyle(0xe9d596, .07); this.markers.fillPoints(area.polygon.map(p => new Phaser.Math.Vector2(p.x, p.y)), true).strokePoints(area.polygon.map(p => new Phaser.Math.Vector2(p.x, p.y)), true);
      const target = targets[this.story.roomId].find(target => target.id === area.id);
      if (target) this.labels.push(this.add.text(area.polygon[0].x, area.polygon[0].y - 19, target.name, { fontFamily: 'monospace', fontSize: '11px', color: '#fff0bb', backgroundColor: '#132019e8', padding: { x: 5, y: 3 } }).setDepth(2100));
    }
  }
  say(text: string, speaker = 'Borin') { this.epoch++; this.clearMovementKeys(); this.talking = true; this.speakingVoice = 'borin'; this.conversationActive = false; this.character.stop(); void this.character.say(text, 3600000); el('dialog').hidden = false; el('speaker').textContent = speaker; el('speech').textContent = text; el('choices').replaceChildren(); el('dialog-next').hidden = false; }
  dismissSpeech() { this.talking = false; this.conversationActive = false; this.character.finishSpeech(); el('dialog').hidden = true; }
  renderTurn(turn: DialogTurn) {
    this.clearMovementKeys();
    if (turn.type === 'end') { this.dismissSpeech(); this.render(); return; }
    this.talking = true; this.conversationActive = true;
    el('dialog').hidden = false; el('choices').replaceChildren();
    if (turn.type === 'line') {
      const voice = turn.resolved.voiceAsset.id.split('.').pop();
      this.speakingVoice = voice ?? 'borin';
      el('speaker').textContent = ({ innkeeper:'Mara', miner:'Orrin', elder:'Elder Rowan', chest:'Runed chest' } as Record<string,string>)[voice ?? ''] ?? 'Borin';
      el('speech').textContent = turn.resolved.text; el('dialog-next').hidden = false;
      if (voice === 'borin') void this.character.say(turn.resolved.text, 3600000);
      else this.character.finishSpeech();
    } else {
      this.character.finishSpeech(); el('speaker').textContent = 'Borin'; el('speech').textContent = turn.decision.prompt; el('dialog-next').hidden = true;
      for (const option of turn.options) el('choices').append(button(option.text, () => {
        applyDialogChoice(this.story, option.id); this.conversation.choose(option.id); this.render();
      }));
    }
  }
  renderCutscene() {
    const isEnding = this.story.endingStep >= 0;
    const index = isEnding ? this.story.endingStep : this.story.introStep;
    const sequence = isEnding ? ending : intro;
    const runner = isEnding ? this.endingRunner : this.introRunner;
    if (runner.snapshot().stepIndex !== index) runner.restore({ cutsceneId: runner.definition.id, version: 1, stepIndex: index, elapsedMs: 0 });
    el('cutscene').hidden = index >= sequence.length;
    if (index >= sequence.length) {
      this.cinematic?.destroy(); this.cinematic = undefined;
      document.body.classList.remove('cinematic-playing');
      this.binding.sync();
      if (isEnding) { this.story.endingStep = -1; this.changeRoom('village'); const body = modal('A king home. A hero made.'); const p = document.createElement('p'); p.textContent = 'You brought Aldric home with a little courage, a little conversation, and an entirely unreasonable amount of stout. Thank you for playing.'; body.append(p, button('Return to Bramblehollow', closeModal)); }
      return;
    }
    const kind = isEnding ? 'ending' : 'intro';
    if (this.cinematic?.snapshot().kind !== kind) {
      this.cinematic?.destroy(); this.cinematic = new ForestCinematic(this, kind);
      this.clearMovementKeys(); this.character.stop(); this.hover();
    }
    document.body.classList.add('cinematic-playing');
    this.cinematic.render(index, runner.snapshot().elapsedMs);
    el('cutscene-kicker').textContent = isEnding ? 'THE JOURNEY HOME' : 'THE STORY BEGINS';
    const step = runner.current()!;
    el('cutscene-speaker').textContent = step.speaker ?? ''; el('cutscene-text').textContent = step.text ?? '';
    el('cutscene-progress').textContent = sequence.map((_, i) => i === index ? '◆' : '◇').join(' ');
    el('skip-intro').hidden = false;
    el('skip-intro').textContent = isEnding ? 'Skip to homecoming' : 'Skip introduction';
    el('cutscene-next').firstChild!.textContent = index === sequence.length - 1 ? isEnding ? 'Home at last ' : 'Begin adventure ' : 'Next scene ';
  }
  advanceCutscene(skip = false) {
    if (!this.cinematic) return;
    const isEnding = this.story.endingStep >= 0;
    const runner = isEnding ? this.endingRunner : this.introRunner;
    if (skip) runner.skip(); else runner.advance();
    if (isEnding) this.story.endingStep = runner.snapshot().stepIndex;
    else this.story.introStep = runner.snapshot().stepIndex;
    this.renderCutscene();
  }
  render() {
    el('room-name').textContent = roomNames[this.story.roomId];
    el('inventory-count').textContent = this.story.inventory.length ? `${this.story.inventory.length} useful ${this.story.inventory.length === 1 ? 'thing' : 'things'}` : 'Travel light.';
    el('inventory').replaceChildren();
    for (const id of this.story.inventory) {
      const node = button('', () => {
        if (this.blocked()) return;
        if (this.selected && this.selected !== id) { const text = combineItems(this.story, this.selected, id); this.selected = undefined; this.say(text); }
        else this.selected = this.selected === id ? undefined : id;
        this.render();
      });
      node.className = `inventory-slot${id === this.selected ? ' selected' : ''}`; node.setAttribute('aria-label', items[id].name); node.setAttribute('aria-pressed', String(id === this.selected)); node.title = items[id].description;
      node.append(items[id].icon); const label = document.createElement('span'); label.className = 'item-label'; label.textContent = items[id].name; node.append(label); el('inventory').append(node);
    }
    for (let i = this.story.inventory.length; i < 6; i++) { const slot = document.createElement('span'); slot.className = 'inventory-slot empty'; slot.textContent = '·'; el('inventory').append(slot); }
    el('clear-item').hidden = !this.selected; el('inventory-hint').textContent = this.selected ? `Use ${items[this.selected].name} with…` : 'A little courage goes a long way.';
    el('objective').textContent = this.story.flags.won ? 'King Aldric is home. Well done, Borin.' : this.story.flags.guardAsleep ? 'Free the king from his cage.' : 'Find the king. Bring him home.';
    el('nearby').replaceChildren();
    for (const target of targets[this.story.roomId].filter(target => targetVisible(this.story, target.id))) {
      const node = button(target.name + (target.exit ? ' ↗' : ''), () => void this.act(target.id)); node.setAttribute('aria-label', `Interact with ${target.name}`); el('nearby').append(node);
    }
    this.drawHotspots();
    this.syncEntities();
  }
  snapshot(): GameState {
    return { roomId: this.story.roomId, inventory: [...this.story.inventory], flags: { ...this.story.flags }, characters: { borin: this.character.snapshot() }, selectedItem: this.selected ?? null,
      dialog: this.conversationActive ? this.conversation.snapshot() as unknown as JSONValue : null,
      cutscene: { introStep: this.story.introStep, endingStep: this.story.endingStep, introElapsedMs: this.introRunner.snapshot().elapsedMs, endingElapsedMs: this.endingRunner.snapshot().elapsedMs },
      extensions: { journal: [...this.story.journal], guardClock: this.story.guardClock, speech: this.talking && !this.conversationActive ? el('speech').textContent ?? '' : '' } };
  }
  validateSave(save: GameState) {
    if (!roomIds.includes(save.roomId as RoomId) || !save.characters.borin || Object.keys(save.characters).length !== 1 || save.inventory.some(item => !(item in items)) || Object.values(save.flags).some(flag => typeof flag !== 'boolean')) throw new Error('Save references unknown adventure content');
    const cutscene = save.cutscene as ForestCheckpoint;
    if (!cutscene || !Number.isInteger(cutscene.introStep) || cutscene.introStep < 0 || cutscene.introStep > intro.length || !Number.isInteger(cutscene.endingStep) || cutscene.endingStep < -1 || cutscene.endingStep > ending.length) throw new Error('Invalid cutscene checkpoint');
    for (const kind of ['intro', 'ending'] as const) {
      const stepIndex = cutscene[`${kind}Step`];
      new CutsceneRunner(cutsceneDefinition(kind)).restore({ cutsceneId: `forest.${kind}`, version: 1, stepIndex: Math.max(0, stepIndex), elapsedMs: cutscene[`${kind}ElapsedMs`] ?? 0 });
    }
    if (!Array.isArray(save.extensions.journal) || !save.extensions.journal.every(line => typeof line === 'string') || typeof save.extensions.guardClock !== 'number' || save.extensions.guardClock < 0 || typeof save.extensions.speech !== 'string') throw new Error('Invalid adventure extension data');
    const checkDialog = new AdventureDialog(dialogs, assets); checkDialog.restore((save.dialog ?? null) as DialogCheckpoint | null);
    const actor = new CharacterController(this.character.config); actor.restore(save.characters.borin);
  }
  restore(save: GameState) {
    this.validateSave(save);
    const conversation = new AdventureDialog(dialogs, assets); const turn = conversation.restore((save.dialog ?? null) as DialogCheckpoint | null);
    const checkpoint = save.cutscene as ForestCheckpoint;
    this.epoch++; this.clearMovementKeys(); this.dismissSpeech();
    this.cinematic?.destroy(); this.cinematic = undefined;
    this.story = { roomId: save.roomId as RoomId, inventory: save.inventory as ItemId[], flags: save.flags as Record<string, boolean>, journal: save.extensions.journal as string[], guardClock: save.extensions.guardClock as number, introStep: checkpoint.introStep, endingStep: checkpoint.endingStep };
    for (const kind of ['intro', 'ending'] as const) this[`${kind}Runner`].restore({ cutsceneId: `forest.${kind}`, version: 1, stepIndex: Math.max(0, checkpoint[`${kind}Step`]), elapsedMs: checkpoint[`${kind}ElapsedMs`] ?? 0 });
    this.selected = (save.selectedItem ?? undefined) as ItemId | undefined;
    this.changeRoom(this.story.roomId, false); this.character.restore(save.characters.borin);
    this.conversation = conversation; conversation.onTurn(next => this.renderTurn(next));
    if (turn && turn.type !== 'end') this.renderTurn(turn);
    else if (save.extensions.speech) this.say(save.extensions.speech as string);
    this.binding.sync(); this.render(); this.renderCutscene();
  }
  update(_time: number, delta: number) {
    if (!this.binding) return;
    if (this.blocked() && this.movementKeys.size) this.clearMovementKeys();
    if (this.cinematic) {
      const designerOpen = this.toolsOpen() || this.editing;
      this.cinematic.setVisible(!designerOpen);
      el('cutscene').hidden = designerOpen;
      if (!modalOpen && !designerOpen) {
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
    const paused = modalOpen || this.toolsOpen() || this.editing || this.story.introStep < intro.length || this.story.endingStep >= 0;
    if (!paused) {
      this.binding.update(Math.min(delta, 100));
      if (!this.talking && this.story.roomId === 'camp' && !this.story.flags.guardAsleep) this.story.guardClock += Math.min(delta, 100);
    }
    for (const npc of this.npcs) {
      npc.setFrame(this.talking && npc.texture.key === `actor.${this.speakingVoice}` ? 6 + Math.floor(this.time.now / 220) % 2 : 4 + Math.floor(this.time.now / 900) % 2);
      if (npc.texture.key === 'actor.guard') { npc.setFlipX(guardLookingAway(this.story)); npc.setAngle(this.story.flags.guardAsleep ? 80 : 0); }
    }
    for (const star of this.stars) { star.image.y = 100 + (star.start + this.time.now * .004 * star.speed) % 320; star.image.alpha = .15 + (Math.sin(this.time.now * .001 + star.start) + 1) * .2; }
    el('guard-status').hidden = this.story.roomId !== 'camp' || this.story.introStep < intro.length;
    const away = guardLookingAway(this.story); el('guard-status').classList.toggle('away', away || this.story.flags.guardAsleep);
    el('guard-status').textContent = this.story.flags.guardAsleep ? '☾ Grub is sound asleep' : away ? '◇ Guard looking away · now is your chance' : '◉ Guard watching · wait for your moment';
  }
}

function setupControls() {
  el('dialog-next').onclick = () => gameScene.conversationActive ? gameScene.conversation.advance() : gameScene.dismissSpeech();
  el('cutscene-next').onclick = () => gameScene.advanceCutscene();
  el('skip-intro').onclick = () => gameScene.advanceCutscene(true);
  el('hotspots').onclick = () => { gameScene.showHotspots = !gameScene.showHotspots; el('hotspots').classList.toggle('active', gameScene.showHotspots); gameScene.drawHotspots(); };
  el('clear-item').onclick = () => { gameScene.selected = undefined; gameScene.render(); };
  el('hint').onclick = () => gameScene.say(hint(gameScene.story), 'A little nudge');
  el('designer').onclick = () => {
    const visible = document.body.classList.toggle('tools-visible');
    if (visible) gameScene.sceneDesigner?.designer.open();
    else { document.querySelectorAll<HTMLButtonElement>('.ai-game-assets-in-game-designer-dock__button[aria-expanded="true"]').forEach(node => node.click()); gameScene.editing = false; }
  };
  el('sound').onclick = () => { const active = music.toggle(); el('sound').setAttribute('aria-pressed', String(active)); el('sound').querySelector('span')!.textContent = active ? 'Sound on' : 'Sound off'; };
  el('journal').onclick = () => { const body = modal('Borin’s field notes'); const list = document.createElement('ol'); for (const note of gameScene.story.journal) { const row = document.createElement('li'); row.textContent = note; list.append(row); } body.append(list); el('clue-dot').hidden = true; };
  el('map').onclick = () => {
    const body = modal('A corner of the Elderwood'); const grid = document.createElement('div'); grid.className = 'map-grid';
    for (const id of roomIds) { const card = document.createElement('div'); card.className = 'map-room'; const image = document.createElement('img'); image.src = gameScene.textures.get(`room.${id}`).getSourceImage() instanceof HTMLCanvasElement ? (gameScene.textures.get(`room.${id}`).getSourceImage() as HTMLCanvasElement).toDataURL() : ''; image.alt = roomNames[id]; const label = document.createElement('span'); label.textContent = roomNames[id]; const sub = document.createElement('small'); sub.textContent = id === gameScene.story.roomId ? 'YOU ARE HERE' : ({ village:'Pub · Cottage · Forest',pub:'From Bramblehollow',house:'From Bramblehollow',forest:'Village · Mine · Camp',mine:'From the Whispering Wood',camp:'From the Whispering Wood' })[id]; label.append(sub); card.append(image, label); grid.append(card); } body.append(grid);
  };
  el('help').onclick = () => { const body = modal('A quieter kind of hero'); const list = document.createElement('ul'); for (const text of ['Click to walk to the nearest reachable ground, or hold the arrow keys to walk. Click a person to talk, or an object to interact. Nearby buttons do the same thing and work with the keyboard.', 'Select an item in your satchel, then click an object to use it. Select a second inventory item to try combining them. Put away clears your selection.', 'Tab reveals hotspots. M opens the map. J opens your journal. The nudge button gives a clue for your current puzzle.', 'The animated introduction and ending play automatically. Next scene advances a shot; Skip finishes the sequence. Save and load any of three slots, even during a conversation or animation. Saves stay in this browser.', 'Designer opens the live scene editor. Draw walkable shapes, tune perspective and zoom, or edit prefab properties. Your changes affect play immediately. Run the local authoring server to promote edits to project files.']) { const li = document.createElement('li'); li.textContent = text; list.append(li); } body.append(list); };
  function saveMenu(mode: 'save' | 'load') {
    const body = modal(mode === 'save' ? 'Keep your place' : 'Pick up the trail');
    let saves: ReturnType<SaveStore['list']>;
    try { saves = gameScene.saves.list(); } catch (error) { toast(String(error)); return; }
    for (const slot of ['1', '2', '3']) {
      const existing = saves.find(save => save.slot === slot); const row = document.createElement('div'); row.className = 'slot-row'; const label = document.createElement('span'); label.textContent = `Slot ${slot}`; const date = document.createElement('small'); date.textContent = existing ? new Date(existing.savedAt).toLocaleString() : 'An unwritten adventure'; label.append(date);
      const action = button(mode === 'save' ? existing ? 'Overwrite' : 'Save here' : 'Load', () => {
        try { if (mode === 'save') { gameScene.saves.save(slot, gameScene.snapshot()); toast(`Adventure saved in slot ${slot}.`); } else { const candidate = gameScene.saves.load(slot); if (!candidate) throw new Error('That slot is empty.'); gameScene.restore(candidate); toast('Welcome back, Borin.'); } closeModal(); }
        catch (error) { toast(error instanceof Error ? error.message : String(error)); }
      }); action.setAttribute('aria-label', `${mode} slot ${slot}`); action.disabled = mode === 'load' && !existing; row.append(label, action); body.append(row);
    }
  }
  el('save').onclick = () => saveMenu('save'); el('load').onclick = () => saveMenu('load');
  el('modal-close').onclick = closeModal; el('modal-backdrop').onclick = event => { if (event.target === el('modal-backdrop')) closeModal(); };
  document.addEventListener('keydown', event => {
    if (editingText(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (arrowDirections[event.key]) {
      if (gameScene.blocked()) return;
      event.preventDefault();
      if (!gameScene.movementKeys.has(event.key)) {
        gameScene.epoch++; gameScene.movementKeys.add(event.key); gameScene.updateMovementKeys();
      }
      return;
    }
    if (event.key === 'Escape') { if (modalOpen) closeModal(); else if (gameScene.editing) gameScene.sceneDesigner?.designer.close(); else { gameScene.selected = undefined; gameScene.epoch++; gameScene.clearMovementKeys(); gameScene.character.stop(); gameScene.render(); } }
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
    if (name === 'scenes') authoredScenes = value;
    else Object.assign(name === 'assets' ? assets : dialogs, value);
  } else if (response.status !== 404) throw new Error(`Could not load authored ${name}: ${response.status}`);
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 960, height: 540, pixelArt: true, antialias: false, backgroundColor: '#1a2922', scene: ForestAdventure, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: false } });
