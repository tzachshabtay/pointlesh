import { readFile, writeFile } from 'node:fs/promises';
import { addBrewAssets } from '../src/brew-assets';
import { addChestGuesses } from '../src/content';

const assetFile = new URL('../public/authoring/assets.json', import.meta.url);
const dialogFile = new URL('../public/authoring/dialogs.json', import.meta.url);
const assets = JSON.parse(await readFile(assetFile, 'utf8')), dialogs = JSON.parse(await readFile(dialogFile, 'utf8'));
addBrewAssets(assets); addChestGuesses(dialogs, assets);
await writeFile(assetFile, JSON.stringify(assets, null, 2) + '\n');
await writeFile(dialogFile, JSON.stringify(dialogs, null, 2) + '\n');
