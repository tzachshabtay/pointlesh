import type Phaser from 'phaser';

type Submitter = Phaser.Renderer.WebGL.RenderNodes.SubmitterQuad;
type Nodes = { Submitter?: Submitter };
type MirrorSet = { image: unknown; maps: Map<number, Phaser.Textures.CanvasTexture> };
const mirrored = new WeakMap<Phaser.Textures.TextureSource, MirrorSet>();
const bindings = new WeakMap<Phaser.GameObjects.Sprite, { original?: Submitter; wrapper: Submitter; prepare: () => void }>();
let nextId = 0;

/** Phaser 4.2 mirrors the normal texture's UVs but not its tangent vectors.
 * Reflect red/green separately so the lit edge stays toward the world light. */
function normalFor(sprite: Phaser.GameObjects.Sprite): Phaser.Textures.TextureSource | undefined {
  const flipX = sprite.flipX !== (sprite.scaleX < 0), flipY = sprite.flipY !== (sprite.scaleY < 0);
  const flags = Number(flipX) + Number(flipY) * 2;
  const texture = sprite.texture, normal = texture.dataSource[sprite.frame.sourceIndex];
  if (!flags || !normal) return normal;
  let set = mirrored.get(normal);
  if (set && set.image !== normal.image) {
    for (const map of set.maps.values()) texture.manager.remove(map.key);
    mirrored.delete(normal); set = undefined;
  }
  if (!set) {
    set = { image: normal.image, maps: new Map() }; mirrored.set(normal, set);
    const owned = set.maps, manager = texture.manager;
    // Phaser clears texture.manager before emitting this removal event.
    manager.once(`removetexture-${texture.key}`, () => { for (const map of owned.values()) if (map.key && manager.exists(map.key)) manager.remove(map.key); owned.clear(); });
  }
  const existing = set.maps.get(flags); if (existing) return existing.source[0];
  const canvas = document.createElement('canvas'); canvas.width = normal.width; canvas.height = normal.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return normal;
  try {
    context.drawImage(normal.image as CanvasImageSource, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (flipX) pixels.data[i] = 255 - pixels.data[i]!;
      if (flipY) pixels.data[i + 1] = 255 - pixels.data[i + 1]!;
    }
    context.putImageData(pixels, 0, 0);
    const map = texture.manager.addCanvas(`pointlesh-normal-mirror-${++nextId}`, canvas)!;
    map.setFilter(normal.scaleMode); set.maps.set(flags, map); return map.source[0];
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error;
    return normal;
  }
}

export function correctMirroredNormals(sprite: Phaser.GameObjects.Sprite, prepare: () => void): void {
  const binding = bindings.get(sprite);
  if (binding) { binding.prepare = prepare; return; }
  const original = (sprite.customRenderNodes as Nodes).Submitter;
  const submitter = original ?? (sprite.defaultRenderNodes as Nodes).Submitter;
  if (!submitter) return;
  const wrapper = Object.create(submitter) as Submitter;
  wrapper.run = (...args: Parameters<Submitter['run']>) => {
    bindings.get(sprite)?.prepare();
    // The implementation expects a TextureSource; Phaser 4.2's declaration
    // currently calls this argument WebGLTextureWrapper instead.
    if (sprite.lighting && !args[7]) args[7] = normalFor(sprite) as unknown as Parameters<Submitter['run']>[7];
    submitter.run(...args);
  };
  bindings.set(sprite, { original, wrapper, prepare });
  sprite.setRenderNodeRole('Submitter', wrapper);
  sprite.once('destroy', releaseMirroredNormals, undefined);
}

export function releaseMirroredNormals(sprite: Phaser.GameObjects.Sprite): void {
  const binding = bindings.get(sprite); if (!binding) return;
  if ((sprite.customRenderNodes as Nodes).Submitter === binding.wrapper) sprite.setRenderNodeRole('Submitter', binding.original ?? null);
  bindings.delete(sprite); sprite.off('destroy', releaseMirroredNormals);
}
