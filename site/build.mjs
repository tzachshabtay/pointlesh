import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'site/public');
const game = resolve(root, 'demos/forest/dist');
const output = resolve(root, 'site/dist');

if (!(await stat(resolve(game, 'index.html')).catch(() => null))) {
  throw new Error('Build the forest demo before assembling the Pages site.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await cp(game, resolve(output, 'demo'), { recursive: true });

const media = await readdir(resolve(output, 'media'));
console.log(`Pages site ready: showcase at /, game at /demo/, ${media.length} feature images.`);
