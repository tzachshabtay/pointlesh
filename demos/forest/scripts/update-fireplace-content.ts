import { readFile, writeFile } from 'node:fs/promises';
import { assertManifest } from '@ai-game-assets/core';
import { assertSceneManifest } from '@scene-designer/core';
import { addFireplaceAssets, addFireplace } from '../src/fireplace-assets.js';

const assetsFile = process.argv[2] ?? new URL('../public/authoring/assets.json', import.meta.url);
const scenesFile = process.argv[3] ?? new URL('../public/authoring/scenes.json', import.meta.url);
const assets = JSON.parse(await readFile(assetsFile, 'utf8'));
addFireplaceAssets(assets); assertManifest(assets);
const scenes = addFireplace(JSON.parse(await readFile(scenesFile, 'utf8')));
assertSceneManifest(scenes);
await writeFile(assetsFile, JSON.stringify(assets, null, 2) + '\n');
await writeFile(scenesFile, JSON.stringify(scenes, null, 2) + '\n');
console.log('Updated the Copper Tankard and cottage fireplaces.');
