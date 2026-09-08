import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { assertManifest, type AiAssetManifest } from '@ai-game-assets/core';
import { assertSceneManifest } from '@scene-designer/core';
import { assets as seedAssets, characterAssetDefinitions, characterAnimations, roomFloorVertices, roomForegroundVertices } from '../src/content.js';
import { CHARACTER_IDS, CHARACTER_VIEWS, CHARACTER_ACTIVITY_FRAMES, characterFramePixels, characterAnimationPixels, characterSheetPixels, type ForestPixelImage, type ForestCharacterId } from '../src/sprites.js';
import { roomIds } from '../src/story.js';

// A minimal lossless RGBA PNG writer keeps this reproducible tool dependency-free.
function png(image: ForestPixelImage): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length); body.copy(output, 4); output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width); header.writeUInt32BE(image.height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let row = 0; row < image.height; row++) rows.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), row * (image.width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const publicDirectory = new URL('../public/', import.meta.url);
for (const id of CHARACTER_IDS) {
  const directory = new URL(`art/characters/${id}/`, publicDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('base.png', directory), png(characterFramePixels(id, 'front', CHARACTER_ACTIVITY_FRAMES.idle[0])));
  await writeFile(new URL('sheet.png', directory), png(characterSheetPixels(id)));
  for (const activity of ['idle', 'walk', 'speak'] as const) for (const view of CHARACTER_VIEWS) {
    await writeFile(new URL(`${activity}-${view}.png`, directory), png(characterAnimationPixels(id, activity, view)));
  }
}
console.log('Wrote six base character images, six 24-frame character sheets, and 54 native animation strips.');

// Explicit promotion changes only character metadata and untouched legacy area seeds.
// Existing unrelated designer work, custom animation slots, and custom area shapes survive.
if (process.argv.includes('--promote')) {
  const assetFile = new URL('authoring/assets.json', publicDirectory);
  const assetManifest = JSON.parse(await readFile(assetFile, 'utf8')) as AiAssetManifest;
  for (const [id, definition] of Object.entries(characterAssetDefinitions)) {
    const previous = assetManifest.assets[id];
    const promoted = { ...previous, ...definition, versions: { ...definition.versions, ...previous?.versions }, activeVersion: previous?.activeVersion || definition.activeVersion };
    if (definition.kind === 'image' && CHARACTER_IDS.some(characterId => id === characterId)) {
      delete promoted.frameGrid;
      delete promoted.animations;
      // Migrate the generated default only; keep authored versions and their selection.
      const legacySheet = `art/characters/${id}/sheet.png`;
      for (const [versionId, version] of Object.entries(definition.versions)) {
        const existing = previous?.versions[versionId];
        if (existing?.file === legacySheet) promoted.versions[versionId] = { ...existing, file: version.file };
      }
    }
    assetManifest.assets[id] = promoted;
    const seedPath = (seedAssets as AiAssetManifest).assetPaths?.[id];
    if (seedPath) (assetManifest.assetPaths ??= {})[id] ??= [...seedPath];
  }
  assertManifest(assetManifest);
  await writeFile(assetFile, JSON.stringify(assetManifest, null, 2) + '\n');

  const sceneFile = new URL('authoring/scenes.json', publicDirectory);
  const sceneManifest = JSON.parse(await readFile(sceneFile, 'utf8'));
  const mergeSlots = (id: ForestCharacterId, existing: Record<string, unknown> = {}) => Object.fromEntries(Object.entries(characterAnimations(id)).map(([activity, slots]) => [activity, { ...slots, ...(existing[activity] as object ?? {}) }]));
  // Derived prefabs are materialized copies, so their defaults need promotion too.
  for (const prefabId of ['pointlesh.character', 'forest.rescue-character']) {
    const prefabProperties = sceneManifest.prefabs[prefabId].pointlesh.properties;
    prefabProperties.animations = mergeSlots('borin', prefabProperties.animations);
    prefabProperties.directions ??= 4;
  }
  const matchesRectangle = (vertices: { x: number; y: number }[], x: number, y: number, width: number, height: number) => JSON.stringify(vertices.map(vertex => [vertex.x, vertex.y])) === JSON.stringify([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
  for (const room of roomIds) for (const layer of sceneManifest.scenes[room].layers) for (const instance of layer.prefabs ?? []) {
    const properties = instance.pointlesh?.properties;
    if (properties?.actorName && CHARACTER_IDS.includes(properties.actorName)) properties.animations = mergeSlots(properties.actorName, properties.animations);
    const vertices = instance.overrides?.area?.vertices;
    if (instance.id === `${room}.floor` && vertices && matchesRectangle(vertices, 35, 355, 890, 160)) instance.overrides.area.vertices = roomFloorVertices(room);
    if (instance.id === `${room}.foreground` && vertices && matchesRectangle(vertices, 0, 200, room === 'forest' ? 163 : 80, 340)) instance.overrides.area.vertices = roomForegroundVertices(room);
  }
  assertSceneManifest(sceneManifest);
  await writeFile(sceneFile, JSON.stringify(sceneManifest, null, 2) + '\n');
  console.log('Promoted character animation registrations, prefab direction slots, and untouched room area seeds.');
}
