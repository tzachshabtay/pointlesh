import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPointleshDevServer } from '../dist/index.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'pointlesh-dev-server-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const assets = { schemaVersion: 1, assets: {} }, scenes = { schemaVersion: 2, scenes: {}, prefabs: {} }, dialogs = { schemaVersion: 1, dialogs: {} };
  for (const [name, value] of Object.entries({ assets, scenes, dialogs })) await writeFile(join(directory, `${name}.json`), JSON.stringify(value));
  return {
    directory, manifests: [assets, scenes, dialogs], options: {
      assets: { manifestPath: join(directory, 'assets.json'), assetsDir: join(directory, 'art'), port: 0 },
      scenes: { manifestPath: join(directory, 'scenes.json'), port: 0 },
      dialogs: { manifestPath: join(directory, 'dialogs.json'), aiAssetsManifestPath: join(directory, 'assets.json'), port: 0 },
    },
  };
}

test('combined services return their actual addresses, serve all manifests, and close together', { timeout: 10000 }, async t => {
  const { options, manifests } = await fixture(t);
  const server = createPointleshDevServer(options);
  t.after(() => server.close());
  const addresses = await server.listen();
  assert.equal(new Set(addresses.map(address => address.port)).size, 3);
  const routes = ['__ai-assets/manifest', '__scene-designer/manifest', '__dialog-designer/manifest'];
  for (let index = 0; index < addresses.length; index++) {
    const address = addresses[index];
    assert.ok(address.port > 0, 'Ephemeral ports must report the actual bound port');
    const response = await fetch(`http://${address.host}:${address.port}/${routes[index]}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), manifests[index]);
  }
  await server.close();
  assert.equal(server.services.every(service => !service.server.listening), true);
  await server.close();
});

for (const failedService of ['scenes', 'dialogs']) {
  test(`occupied ${failedService} port rejects startup and rolls back every earlier service`, { timeout: 10000 }, async t => {
    const { options } = await fixture(t);
    const occupied = createServer();
    occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
    t.after(() => new Promise(resolve => occupied.close(resolve)));
    options[failedService].port = occupied.address().port;
    const server = createPointleshDevServer(options);
    t.after(() => server.close());
    await assert.rejects(server.listen(), error => error.code === 'EADDRINUSE');
    assert.equal(server.services.every(service => !service.server.listening), true);
    assert.equal(occupied.listening, true, 'Rollback must not touch the unrelated server occupying the port');
  });
}

test('invalid authoring HTTP save is rejected and preserves the prior manifest', { timeout: 10000 }, async t => {
  const { options, directory } = await fixture(t);
  const server = createPointleshDevServer(options); t.after(() => server.close());
  const addresses = await server.listen(), sceneAddress = addresses[1];
  const before = await readFile(join(directory, 'scenes.json'), 'utf8');
  const response = await fetch(`http://${sceneAddress.host}:${sceneAddress.port}/__scene-designer/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manifest: { schemaVersion: 999 } }),
  });
  assert.equal(response.status, 500);
  assert.ok((await response.json()).error);
  assert.equal(await readFile(join(directory, 'scenes.json'), 'utf8'), before);
});

test('CLI documents serve and rejects an invalid port before opening a service', async () => {
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const run = promisify(execFile);
  const help = await run(process.execPath, [cli, '--help']);
  assert.match(help.stdout, /pointlesh-dev serve/);
  await assert.rejects(run(process.execPath, [cli, 'serve', '--port=65534']), error => error.code === 1 && /Port must/.test(error.stderr));
});
