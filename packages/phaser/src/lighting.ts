import type Phaser from 'phaser';
import type { ResolvedPointleshObject, PointleshPropertySchema } from '@pointlesh/core';
import { createSilhouetteNormals } from './silhouette-normals.js';
import { correctMirroredNormals, releaseMirroredNormals } from './mirrored-normals.js';

export type CharacterLightingOptions = { enabled?: boolean; normals?: 'silhouette' | 'existing' };
export type AdventureLight = { id: string; x: number; y: number; radius: number; color: number; intensity: number; z?: number };
export type AdventureLightingEnvironment = { ambientColor: number; lights: readonly AdventureLight[] };
export const characterLightDefaults = { lightAffectsCharacters: true, lightCharacterRadiusScale: 2.2, lightCharacterIntensityScale: .9, lightCharacterHeightRatio: .35 };
export const characterLightSchema: Record<string, PointleshPropertySchema> = {
  lightAffectsCharacters: { type: 'boolean', label: 'Light characters' },
  lightCharacterRadiusScale: { type: 'number', label: 'Character light reach multiplier', min: .1, step: .1 },
  lightCharacterIntensityScale: { type: 'number', label: 'Character light intensity multiplier', min: 0, step: .1 },
  lightCharacterHeightRatio: { type: 'number', label: 'Character light elevation / radius', min: 0, max: 1, step: .05 },
};
type GeneratedNormal = { image: unknown; width: number; height: number; frameCount: number; normal?: Phaser.Textures.TextureSource };
const generatedNormals = new WeakMap<Phaser.Textures.TextureSource, GeneratedNormal>();

/** Uses authored normal maps when present, otherwise caches shallow alpha-based
 * relief on the actual active texture (including previews and scaled variants). */
export function applyCharacterLighting(sprite: Phaser.GameObjects.Sprite, options: boolean | CharacterLightingOptions): void {
  const config = typeof options === 'boolean' ? { enabled: options } : options;
  const enabled = config.enabled !== false && sprite.scene.sys.game.renderer.type === 2;
  sprite.setLighting(enabled);
  if (!enabled) { releaseMirroredNormals(sprite); return; }
  const prepare = () => { if (config.normals !== 'existing') prepareNormal(sprite); };
  // AI Assets may choose a scaled variant after the actor update. Prepare the
  // texture actually submitted for rendering as well as the current pose.
  correctMirroredNormals(sprite, prepare); prepare();
}

function prepareNormal(sprite: Phaser.GameObjects.Sprite): void {
  const texture = sprite.texture, index = sprite.frame.sourceIndex, source = texture.source[index]!;
  const cached = generatedNormals.get(source), current = texture.dataSource[index];
  if (current && current !== cached?.normal) return; // An authored map always wins.
  const frames = Object.values(texture.frames).filter(frame => frame.sourceIndex === index && frame.name !== '__BASE');
  if (cached?.image === source.image && cached.width === source.width && cached.height === source.height && cached.frameCount === frames.length) return;
  const entry: GeneratedNormal = { image: source.image, width: source.width, height: source.height, frameCount: frames.length };
  generatedNormals.set(source, entry);
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  try {
    context.drawImage(source.image as CanvasImageSource, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    pixels.data.set(createSilhouetteNormals(pixels.data, canvas.width, canvas.height,
      frames.length ? frames.map(frame => ({ x: frame.cutX, y: frame.cutY, width: frame.cutWidth, height: frame.cutHeight }))
        : [{ x: 0, y: 0, width: canvas.width, height: canvas.height }]));
    context.putImageData(pixels, 0, 0);
    texture.setDataSource(canvas, index);
    entry.normal = texture.dataSource[index];
    entry.normal?.setFilter(source.scaleMode);
  } catch (error) {
    // Cross-origin textures without CORS still receive flat-surface lighting.
    if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error;
  }
}

/** Convert a prefab's existing animated light into a light that reaches actors. */
export function objectCharacterLight(object: ResolvedPointleshObject, sprite: Phaser.GameObjects.Sprite): AdventureLight | undefined {
  const p = object.properties;
  if (!object.enabled || !sprite.visible || p.lightEnabled !== true || p.lightAffectsCharacters === false) return;
  const number = (key: string, fallback: number) => typeof p[key] === 'number' && Number.isFinite(p[key]) ? p[key] as number : fallback;
  const radius = Math.max(1, number('lightCharacterRadius', Math.max(number('lightRadiusX', 100), number('lightRadiusY', 100)) * number('lightCharacterRadiusScale', 2.2)));
  const phase = Math.max(0, (sprite.anims.currentFrame?.index ?? 1) - 1);
  const frames = p.lightFrameIntensities;
  const flicker = Array.isArray(frames) && typeof frames[phase] === 'number' && Number.isFinite(frames[phase]) ? Math.max(0, Number(frames[phase])) : 1;
  return { id: object.id, x: sprite.x + number('lightOffsetX', 0), y: sprite.y + number('lightOffsetY', 0), radius,
    color: typeof p.lightColor === 'string' && /^#[\da-f]{6}$/i.test(p.lightColor) ? Number.parseInt(p.lightColor.slice(1), 16) : 0xffa34d,
    intensity: Math.max(0, number('lightCharacterIntensity', number('lightIntensity', .5) * number('lightCharacterIntensityScale', .9))) * flicker,
    z: Math.max(0, number('lightCharacterHeight', radius * number('lightCharacterHeightRatio', .35))) };
}

/** Owns native Phaser 4 lights and ambient color for one adventure Scene.
 * Supply a container for cinematic worlds; lights are transformed into Scene
 * coordinates because Phaser lights cannot be children of a Container. */
export class PhaserAdventureLighting {
  private readonly lights = new Map<string, Phaser.GameObjects.Light>();
  private readonly previousAmbient: { r: number; g: number; b: number };
  private readonly wasEnabled: boolean;
  private destroyed = false;
  enabled = true;

  constructor(readonly scene: Phaser.Scene) {
    const { r, g, b } = scene.lights.ambientColor;
    this.previousAmbient = { r, g, b }; this.wasEnabled = scene.lights.active;
    scene.lights.enable(); scene.events.once('shutdown', this.destroy, this);
  }

  sync(environment: AdventureLightingEnvironment, container?: Phaser.GameObjects.Container): void {
    if (this.destroyed) return;
    this.scene.lights.setAmbientColor(this.enabled ? environment.ambientColor : 0xffffff);
    const matrix = container?.getWorldTransformMatrix();
    const scale = matrix ? Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : 1;
    const ids = new Set<string>();
    for (const source of this.enabled ? environment.lights : []) {
      if (![source.x, source.y, source.radius, source.intensity, source.z ?? 0].every(Number.isFinite) || source.radius <= 0) continue;
      ids.add(source.id);
      let light = this.lights.get(source.id);
      if (!light) { light = this.scene.lights.addLight(); this.lights.set(source.id, light); }
      const point = matrix?.transformPoint(source.x, source.y) ?? source;
      light.setPosition(point.x, point.y).setRadius(source.radius * scale).setColor(source.color)
        .setIntensity(Math.max(0, source.intensity)).setZ((source.z ?? source.radius * .35) * scale);
    }
    for (const [id, light] of this.lights) if (!ids.has(id)) { this.scene.lights.removeLight(light); this.lights.delete(id); }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.scene.events.off('shutdown', this.destroy, this);
    for (const light of this.lights.values()) this.scene.lights.removeLight(light);
    this.lights.clear();
    const { r, g, b } = this.previousAmbient; this.scene.lights.ambientColor.set(r, g, b);
    if (!this.wasEnabled) this.scene.lights.disable();
  }
}
