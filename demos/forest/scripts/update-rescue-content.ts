import { readFile, writeFile } from 'node:fs/promises';
import { assertManifest } from '@ai-game-assets/core';
import { assertSceneManifest } from '@scene-designer/core';
import { addGuardAnimations } from '../src/guard-assets.js';
import { addForestObjectAssets, updateForestInteractions, updateRescueAssetText } from '../src/scene-content-updates.js';
import { addForestPoints } from '../src/points.js';

const assetsFile = process.argv[2] ?? new URL('../public/authoring/assets.json', import.meta.url);
const scenesFile = process.argv[3] ?? new URL('../public/authoring/scenes.json', import.meta.url);
const assets = JSON.parse(await readFile(assetsFile, 'utf8'));
addGuardAnimations(assets); addForestObjectAssets(assets); updateRescueAssetText(assets); assertManifest(assets);
await writeFile(assetsFile, JSON.stringify(assets, null, 2) + '\n');
const scenes = addForestPoints(updateForestInteractions(JSON.parse(await readFile(scenesFile, 'utf8'))));
assertSceneManifest(scenes);
await writeFile(scenesFile, JSON.stringify(scenes, null, 2) + '\n');
console.log('Updated rescue interactions, assets, and puzzle descriptions.');
