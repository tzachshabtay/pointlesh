import { mkdir, writeFile } from 'node:fs/promises';
import { assets, dialogs, scenes } from '../src/content.js';

// Explicit initial seed/reset tool. Normal builds never overwrite promoted designer work.
const directory = new URL('../public/authoring/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, manifest] of Object.entries({ assets, dialogs, scenes })) {
  await writeFile(new URL(`${name}.json`, directory), JSON.stringify(manifest, null, 2) + '\n', { flag: process.argv.includes('--reset') ? 'w' : 'wx' });
}
