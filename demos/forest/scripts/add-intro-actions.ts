import { readFile, writeFile } from 'node:fs/promises';
import { assertManifest } from '@ai-game-assets/core';
import { addIntroAssets } from '../src/intro-assets.js';

const file = process.argv[2] ?? new URL('../public/authoring/assets.json', import.meta.url);
const assets = JSON.parse(await readFile(file, 'utf8'));
addIntroAssets(assets);
assertManifest(assets);
await writeFile(file, JSON.stringify(assets, null, 2) + '\n');
