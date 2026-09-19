import { readFile, writeFile } from 'node:fs/promises';
import { addForestPoints } from '../src/points.js';

const path = new URL('../public/authoring/scenes.json', import.meta.url);
const source = JSON.parse(await readFile(path, 'utf8'));
await writeFile(path, JSON.stringify(addForestPoints(source), null, 2) + '\n');
console.log('Named room-entry and interaction points saved; existing authored content preserved.');
