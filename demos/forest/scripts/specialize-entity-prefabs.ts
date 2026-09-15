import { readFile, writeFile } from 'node:fs/promises';
import { specializeForestEntities } from '../src/entity-prefabs';

const file = new URL('../public/authoring/scenes.json', import.meta.url);
const source = JSON.parse(await readFile(file, 'utf8'));
const result = specializeForestEntities(source);
await writeFile(file, JSON.stringify(result, null, 2) + '\n');
console.log('Named character, object, hotspot and area prefabs saved; authored room content preserved.');
