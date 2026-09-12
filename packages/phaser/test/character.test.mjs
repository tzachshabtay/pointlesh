import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { AiAssetRuntime } from '@ai-game-assets/phaser';
import { CharacterController } from '@pointlesh/core';
import { PhaserAdventureCharacter } from '../dist/character.js';

const floor = [[{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }]];
const asset = (id, animations = []) => ({ id, kind: 'spritesheet', prompt: id, versions: {}, animations, frameGrid: { frameWidth: 32, frameHeight: 40, columns: 6, rows: 1 } });
const clip = (key, frames, frameRate, frameTimings) => ({ key, frames, frameRate, ...(frameTimings ? { frameTimings } : {}) });

function fixture(overrides = {}) {
  const manifest = { schemaVersion: 1, assets: {
    parent: { ...asset('parent'), linkedAnimationAssets: { idle: { label: 'Idle', assetId: 'idle' }, walk: { label: 'Walk', assetId: 'walk' }, speak: { label: 'Speak', assetId: 'speak' } } },
    idle: asset('idle', [clip('idle-cycle', [0, 1], 2)]),
    walk: asset('walk', [clip('walk-cycle', [0, 1, 2, 3, 4, 5], 10, [{ delayMs: 50 }, { delayMs: 150 }])]),
    speak: asset('speak', [clip('speak-cycle', [0, 1], 5)]),
  } };
  const animations = new Map();
  const scene = { events: new EventEmitter(), textures: { exists: () => true }, anims: {
    exists: key => animations.has(key), get: key => animations.get(key), remove: key => animations.delete(key),
    generateFrameNumbers: (key, options) => options.frames.map(frame => ({ key, frame })),
    create: config => { const value = { ...config, frames: config.frames.map((frame, index) => ({ ...frame, textureFrame: frame.frame, index: index + 1 })) }; animations.set(config.key, value); return value; },
  } };
  const sprite = Object.assign(new EventEmitter(), {
    x: 100, y: 100, scaleX: 1, scaleY: 1, width: 32, height: 40, flipX: false,
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setDepth(value) { this.depth = value; return this; }, setScale(x, y) { this.scaleX = x; this.scaleY = y; return this; },
    setOrigin(x, y) { this.originX = x; this.originY = y; return this; }, setFlipX(value) { this.flipX = value; return this; },
    setRotation(value) { this.rotation = value; return this; },
    setDisplaySize(width, height) { this.scaleX = width / this.width; this.scaleY = height / this.height; return this; },
    setTexture(key, frame = 0) { this.textureKey = key; this.frame = frame; return this; }, setFrame(frame) { this.frame = frame; return this; },
    stop() { this.anims.stop(); return this; },
    play(key) { this.anims.currentAnim = animations.get(typeof key === 'string' ? key : key.key); this.anims.isPlaying = true; return this; },
  });
  sprite.anims = { currentAnim: undefined, isPlaying: false, stop() { this.isPlaying = false; }, pause() { this.isPlaying = false; }, setCurrentFrame(frame) { sprite.setTexture(frame.key, frame.frame); } };
  const runtime = new AiAssetRuntime(scene, manifest);
  const controller = new CharacterController({ id: 'borin', position: { x: 100, y: 100 }, walkStep: 10, directions: 8 });
  let mapping = { idle: { front: { assetId: 'parent', key: 'idle' } }, walk: { right: { assetId: 'parent', key: 'walk', flipX: true }, back: { assetId: 'parent', key: 'walk' } }, speak: { front: { assetId: 'parent', key: 'speak' } } };
  const view = new PhaserAdventureCharacter(scene, controller, sprite, { autoUpdate: false, aiRuntime: runtime, assetId: 'parent', animations: () => mapping, ...overrides });
  return { scene, sprite, runtime, controller, view, manifest, get mapping() { return mapping; }, set mapping(value) { mapping = value; } };
}

test('native linked animation states drive idle frames and frame-linked walking using actual frame delays', () => {
  const { view, controller, sprite } = fixture();
  assert.equal(controller.config.frameCount, 2); assert.equal(controller.config.frameDurationMs, 500);
  view.update(500); assert.equal(sprite.frame, 1); assert.equal(sprite.x, 100);
  controller.setMovementDirection({ x: 1, y: 0 }, floor);
  view.update(49); assert.equal(sprite.x, 100); assert.equal(controller.config.frameCount, 6); assert.equal(sprite.flipX, true);
  view.update(1); assert.equal(sprite.x, 110); assert.equal(sprite.frame, 1);
  view.update(149); assert.equal(sprite.x, 110); view.update(1); assert.equal(sprite.x, 120); assert.equal(sprite.frame, 2);
  view.update(40); controller.setMovementDirection({ x: 0, y: -1 }, floor); view.update(59);
  assert.equal(sprite.y, 100); view.update(1); assert.equal(sprite.y, 90); assert.equal(sprite.flipX, false);
  view.destroy();
});

test('restoring walk frame 5 while idle frame count is 2 retains the exact authored phase', () => {
  const source = fixture(); source.controller.walkTo({ x: 1000, y: 100 }, floor); source.view.update(575);
  const snapshot = source.controller.snapshot(); assert.equal(snapshot.animationFrame, 5); assert.equal(snapshot.animationElapsedMs, 75);
  const loaded = fixture(); loaded.controller.restore(snapshot); loaded.view.sync();
  assert.equal(loaded.sprite.frame, 5); assert.equal(loaded.controller.state.animationElapsedMs, 75);
  source.view.update(25); loaded.view.update(25); assert.deepEqual(loaded.controller.snapshot(), source.controller.snapshot());
  source.view.destroy(); loaded.view.destroy();
});

test('live assignment flips, native previews and same-key manifest animation edits update paused playback', () => {
  let scale = { x: 2, y: 3 }, origin = { x: 0.4, y: 0.9 };
  const f = fixture({ baseScale: () => scale, origin: () => origin, angle: () => 15 });
  f.controller.setMovementDirection({ x: 1, y: 0 }, floor); f.view.update(50);
  f.mapping.walk.right.flipX = false; f.view.sync(); assert.equal(f.sprite.flipX, false);
  const preview = asset('walk', [clip('walk-cycle', [2, 0], 4, [{ delayMs: 250, scaleX: 0.5, offsetX: 4, rotation: 20 }, { delayMs: 100 }])]);
  f.runtime.designerCallbacks().onPreview('walk', 'preview-texture', preview);
  f.view.sync(); assert.equal(f.controller.config.frameCount, 2); assert.equal(f.sprite.textureKey, 'preview-texture'); assert.equal(f.sprite.frame, 0);
  f.controller.state.animationFrame = 0; f.view.sync(); assert.equal(f.sprite.frame, 2);
  assert.equal(f.sprite.scaleX, 1); assert.equal(f.sprite.scaleY, 3); assert.equal(f.sprite.originX, 0.4 - 4 / 64);
  assert.equal(f.sprite.rotation, 35 * Math.PI / 180);
  scale = { x: 4, y: 2 }; origin = { x: 0.5, y: 1 }; f.view.sync(); assert.equal(f.sprite.scaleX, 2); assert.equal(f.sprite.scaleY, 2);
  f.runtime.designerCallbacks().onAssetReady('walk', 'ai:walk', f.manifest.assets.walk);
  f.manifest.assets.walk.animations = [clip('walk-cycle', [5, 4, 3], 20)];
  f.view.sync(); assert.equal(f.controller.config.frameCount, 3); assert.equal(f.controller.config.frameDurationMs, 50); assert.equal(f.sprite.frame, 5);
  f.view.update(50); assert.equal(f.sprite.frame, 4);
  f.view.destroy();
});

test('finite speech transitions to the authored idle clock consistently within a long update', () => {
  const whole = fixture(), parts = fixture();
  whole.controller.say('Hello', 250); parts.controller.say('Hello', 250);
  whole.view.update(850); parts.view.update(200); parts.view.update(50); parts.view.update(600);
  assert.equal(whole.sprite.frame, 1); assert.equal(whole.controller.state.animationElapsedMs, 100);
  assert.deepEqual(parts.controller.snapshot(), whole.controller.snapshot());
  whole.view.destroy(); parts.view.destroy();
});

test('removing assignments restores legacy frame callbacks and detaches texture previews on destroy', () => {
  const f = fixture({ frame: () => 7 });
  f.mapping = {}; f.view.sync(); assert.equal(f.sprite.frame, 7); assert.equal(f.controller.config.frameCount, 4);
  const before = f.controller.state.position.x; f.view.destroy();
  f.runtime.designerCallbacks().onPreview('parent', 'removed-preview', f.manifest.assets.parent);
  assert.notEqual(f.sprite.textureKey, 'removed-preview'); f.view.update(1000); assert.equal(f.controller.state.position.x, before);
});

test('a live camera getter leaves editor zoom untouched during animation and designer synchronization', () => {
  const camera = { zoom: 2, setZoom(value) { this.zoom = value; } };
  let editing = true;
  const f = fixture({ camera: () => editing ? undefined : camera });
  f.view.update(100); f.view.sync(); assert.equal(camera.zoom, 2);
  editing = false; f.view.sync(); assert.equal(camera.zoom, 1);
  editing = true; camera.zoom = .6; f.view.refreshAnimation(); assert.equal(camera.zoom, .6);
  f.view.destroy();
});

test('different animation pixel resolutions preserve base-image size and authored frame transforms', () => {
  const f = fixture({ baseScale: { x: 2, y: 3 } });
  delete f.manifest.assets.parent.frameGrid;
  f.manifest.assets.parent.dimensions = { width: 48, height: 64 };
  // A high-resolution idle frame, followed by an older low-resolution speech clip.
  f.sprite.width = 48; f.sprite.height = 64; f.view.sync();
  const idleSize = [f.sprite.width * f.sprite.scaleX, f.sprite.height * f.sprite.scaleY];
  f.sprite.width = 24; f.sprite.height = 32;
  f.controller.say('Still the same character', 1000); f.view.sync();
  assert.deepEqual([f.sprite.width * f.sprite.scaleX, f.sprite.height * f.sprite.scaleY], idleSize);
  assert.deepEqual(idleSize, [96, 192]);

  f.manifest.assets.speak.animations[0].frameTimings = [{ scaleX: .5, scaleY: .75, offsetX: 6, offsetY: -8 }];
  f.view.refreshAnimation();
  assert.deepEqual([f.sprite.width * f.sprite.scaleX, f.sprite.height * f.sprite.scaleY], [48, 144]);
  assert.equal(f.sprite.originX, .5 - 6 / 96);
  assert.equal(f.sprite.originY, 1 + 8 / 192);
  // Promoting a differently sized base image updates the logical size on sync.
  f.manifest.assets.parent.dimensions = { width: 60, height: 80 }; f.view.sync();
  assert.deepEqual([f.sprite.width * f.sprite.scaleX, f.sprite.height * f.sprite.scaleY], [60, 180]);
  f.view.destroy();
});

test('an explicit logical size overrides asset resolution and remains live', () => {
  let size = { width: 20, height: 30 };
  const f = fixture({ baseSize: () => size, baseScale: 2 });
  assert.deepEqual([f.sprite.width * f.sprite.scaleX, f.sprite.height * f.sprite.scaleY], [40, 60]);
  size = { width: 40, height: 50 }; f.view.sync();
  assert.deepEqual([f.sprite.width * f.sprite.scaleX, f.sprite.height * f.sprite.scaleY], [80, 100]);
  f.view.destroy();
});
