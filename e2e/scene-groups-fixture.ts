import { installPointleshDesigner } from '../packages/designer/src/inspector';
import { createCharacterPrefab, createObjectPrefab, createPointPrefab, createPointleshArea, createPointleshInstance, pointleshPrefabs } from '@pointlesh/core';
import { createLayer, createScene } from '@scene-designer/core';

const character = createCharacterPrefab({ id: 'borin', name: 'Borin' });
const object = createObjectPrefab({ id: 'door', name: 'Copper Tankard door · outside' });
const point = createPointPrefab({ id: 'entry', name: 'Entry point' });
const scene = createScene({ id: 'village', name: 'Bramblehollow' });
(scene as typeof scene & { pointleshBackground: { assetId: string; visible: boolean; locked: boolean } }).pointleshBackground =
  { assetId: 'background.village', visible: true, locked: false };
const layer = createLayer({ id: 'adventure', name: 'Adventure' });
layer.prefabs = [
  createPointleshInstance({ id: 'hero', prefabId: character.id }),
  createPointleshInstance({ id: 'door-1', prefabId: object.id }),
  createPointleshInstance({ id: 'entry-1', prefabId: point.id }),
];
layer.areas.push(createPointleshArea({ id: 'ground', kind: 'area', name: 'Ground' }), createPointleshArea({ id: 'well', kind: 'hotspot', name: 'Well' }));
scene.layers = [layer];
const manifest = { schemaVersion: 2, prefabs: { ...pointleshPrefabs(), borin: character, door: object, entry: point }, scenes: { village: scene } };
const additionalBackgrounds = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
  const id = `background.extra-${index + 1}`;
  return [id, { id, kind: 'image', dimensions: { width: 960, height: 540 }, activeVersion: 'base', versions: { base: { name: 'base', file: `${id}.png` } } }];
}));
const installed = installPointleshDesigner({ manifest, aiAssets: { schemaVersion: 1, assets: {
  'background.village': { id: 'background.village', kind: 'image', dimensions: { width: 960, height: 540 }, activeVersion: 'base', versions: { base: { name: 'base', file: 'village.png' } } },
  'background.forest': { id: 'background.forest', kind: 'image', dimensions: { width: 960, height: 540 }, activeVersion: 'base', versions: { base: { name: 'base', file: 'forest.png' } } },
  ...additionalBackgrounds,
} }, mount: document.body });
installed.designer.open();
(window as any).sceneGroupsFixture = installed;
