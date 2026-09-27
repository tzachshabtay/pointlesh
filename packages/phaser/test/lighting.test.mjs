import test from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'eventemitter3';
import { createSilhouetteNormals } from '../dist/silhouette-normals.js';
import { objectCharacterLight, PhaserAdventureLighting } from '../dist/lighting.js';

test('silhouette relief follows alpha and isolates atlas frames at arbitrary sizes', () => {
  for (const [w, h] of [[9, 17], [33, 49], [101, 137]]) {
    const rgba = new Uint8ClampedArray(w * 2 * h * 4);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) rgba[(y * w * 2 + x) * 4 + 3] = 255;
    const frames = [{ x: 0, y: 0, width: w, height: h }, { x: w, y: 0, width: w, height: h }];
    const a = createSilhouetteNormals(rgba, w * 2, h, frames);
    for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 255; rgba[i + 1] = 47; }
    assert.deepEqual(createSilhouetteNormals(rgba, w * 2, h, frames), a, 'Painted light and dark colors are not interpreted as geometry');
    const left = (Math.floor(h / 2) * w * 2 + 2) * 4, right = left + (w - 5) * 4;
    assert.ok(a[left] < 128); assert.ok(a[right] > 128);
    const top = (2 * w * 2 + Math.floor(w / 2)) * 4;
    assert.ok(a[top + 1] > 128, 'The top edge points upward');
    for (let y = 0; y < h; y++) for (let x = w; x < w * 2; x++) assert.deepEqual([...a.subarray((y * w * 2 + x) * 4, (y * w * 2 + x) * 4 + 4)], [128, 128, 255, 255]);
  }
});

test('actor lights follow the displayed animation phase and authored controls', () => {
  const object = { id: 'lantern', enabled: true, properties: { lightEnabled: true, lightColor: '#ff8000', lightRadiusX: 100, lightRadiusY: 80,
    lightOffsetX: 10, lightOffsetY: -20, lightIntensity: .5, lightFrameIntensities: [.4, 1] } };
  const sprite = { x: 100, y: 200, visible: true, anims: { currentFrame: { index: 1 } } };
  const dim = objectCharacterLight(object, sprite); sprite.anims.currentFrame.index = 2;
  const bright = objectCharacterLight(object, sprite);
  assert.deepEqual([bright.x, bright.y, bright.color], [110, 180, 0xff8000]);
  assert.equal(bright.intensity, dim.intensity / .4); assert.ok(Math.abs(bright.radius - 220) < 1e-8);
  object.properties.lightCharacterRadius = 400; object.properties.lightCharacterIntensity = 2;
  assert.equal(objectCharacterLight(object, sprite).radius, 400); assert.equal(objectCharacterLight(object, sprite).intensity, 2);
  object.properties.lightAffectsCharacters = false; assert.equal(objectCharacterLight(object, sprite), undefined);
});

test('native light ownership handles room changes, cinematic transforms, A/B toggle and shutdown', () => {
  const lights = { active: false, list: new Set(), ambientColor: { r: .2, g: .3, b: .4, set(r,g,b) { Object.assign(this,{r,g,b}); } },
    enable() { this.active = true; }, disable() { this.active = false; }, setAmbientColor(color) { this.color = color; },
    addLight() { const light = { setPosition(x,y) { Object.assign(this,{x,y});return this; }, setRadius(radius) { this.radius=radius;return this; },
      setColor(color) { this.color=color;return this; }, setIntensity(intensity) { this.intensity=intensity;return this; }, setZ(z) { this.z=z;return this; } }; this.list.add(light);return light; },
    removeLight(light) { this.list.delete(light); } };
  const foreign = lights.addLight(), scene = { lights, events: new EventEmitter() }, lighting = new PhaserAdventureLighting(scene);
  const environment = { ambientColor: 0x556677, lights: [{id:'one', x:10, y:20, radius:100, color:0xffaa00, intensity:.6, z:30}] };
  lighting.sync(environment, { getWorldTransformMatrix: () => ({a:2,b:0,c:0,d:2,transformPoint:(x,y)=>({x:x*2-5,y:y*2-10})}) });
  const light = [...lights.list].find(light=>light!==foreign);
  assert.deepEqual([light.x, light.y, light.radius, light.z], [15,30,200,60]);
  lighting.sync({...environment,lights:[]}); assert.deepEqual([...lights.list],[foreign]);
  lighting.enabled=false; lighting.sync(environment); assert.equal(lights.color,0xffffff); assert.equal(lights.list.size,1);
  lighting.enabled=true; lighting.sync(environment); assert.equal(lights.list.size,2);
  scene.events.emit('shutdown'); lighting.destroy(); assert.deepEqual([...lights.list],[foreign]); assert.equal(lights.active,false);
  assert.deepEqual([lights.ambientColor.r,lights.ambientColor.g,lights.ambientColor.b],[.2,.3,.4]);
});
