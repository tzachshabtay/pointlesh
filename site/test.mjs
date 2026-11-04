import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const output = resolve(import.meta.dirname, 'dist');

test('Pages publishes the showcase at the root and the game at /demo/', async () => {
  const [site, game] = await Promise.all([
    readFile(resolve(output, 'index.html'), 'utf8'),
    readFile(resolve(output, 'demo/index.html'), 'utf8'),
  ]);
  assert.match(site, /href="demo\/"/);
  assert.match(site, /id="feature-grid"/);
  assert.match(game, /\.\/assets\//);
  assert.ok((await stat(resolve(output, 'demo/assets'))).isDirectory());
  assert.ok((await stat(resolve(output, 'media/village-scene.jpg'))).isFile());
});
