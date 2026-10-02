import { readFile, writeFile } from 'node:fs/promises';
import { addPortraitAssets, addCharacterPortraits } from '../src/portrait-assets';

for (const name of ['assets', 'scenes']) {
  const file = new URL(`../public/authoring/${name}.json`, import.meta.url);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (name === 'assets') addPortraitAssets(manifest);
  else addCharacterPortraits(manifest);
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
}
