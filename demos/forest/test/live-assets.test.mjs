import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { tsImport } from 'tsx/esm/api';
const { stablePreview } = await tsImport('../scripts/stable-preview.ts', import.meta.url);

for (const base of ['/', '/preview/']) {
  test(`newly promoted media is available immediately under ${base}, without watcher notification`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'pointlesh-live-assets-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'public/art'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html><p>Game page, not an audio recording</p>');
    const server = await createServer({ configFile: false, root, base, plugins: [stablePreview()],
      logLevel: 'silent', server: { host: '127.0.0.1', port: 0, watch: null } });
    t.after(() => server.close());
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}${base}`;
    // New generations are created by another server, after Vite has built its file list.
    const bytes = await readFile(new URL('../public/art/line.elder.greeting.promoted-1793324837849-1.mp3', import.meta.url));
    await writeFile(join(root, 'public/art/new take.mp3'), bytes);
    const response = await fetch(`${origin}art/new%20take.mp3`);
    assert.match(response.headers.get('content-type'), /^audio\/mpeg/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const range = await fetch(`${origin}art/new%20take.mp3?preview=1`, { headers: { Range: 'bytes=0-63' } });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 64));
    await writeFile(join(root, 'public/art/new-sprite.png'), Buffer.from([137, 80, 78, 71]));
    const image = await fetch(`${origin}art/new-sprite.png`);
    assert.match(image.headers.get('content-type'), /^image\/png/);
    const missing = await fetch(`${origin}art/missing.mp3`);
    assert.equal(missing.status, 404, 'missing media must not receive the HTML game fallback');
    const page = await fetch(origin);
    assert.match(await page.text(), /Game page/);
  });
}
