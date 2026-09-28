import { readFile, writeFile } from 'node:fs/promises';
import { assertManifest } from '@ai-game-assets/core';
import { assertSceneManifest } from '@scene-designer/core';
import { addDoorAssets, addForestTransitions } from '../src/transition-content.js';

const assetFile = process.argv[2] ?? new URL('../public/authoring/assets.json', import.meta.url);
const sceneFile = process.argv[3] ?? new URL('../public/authoring/scenes.json', import.meta.url);
const assets = JSON.parse(await readFile(assetFile, 'utf8'));
addDoorAssets(assets); assertManifest(assets);
await writeFile(assetFile, JSON.stringify(assets, null, 2) + '\n');
const scenes = addForestTransitions(JSON.parse(await readFile(sceneFile, 'utf8')));
assertSceneManifest(scenes);
await writeFile(sceneFile, JSON.stringify(scenes, null, 2) + '\n');
