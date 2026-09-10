import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = fileURLToPath(new URL('../', import.meta.url));
const sentinel = 'POINTLESH_OFFLINE_PROVIDER_SENTINEL';

async function authoringFingerprint() {
  const hashes = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
  await visit(join(demo, 'public/authoring'));
  await visit(join(demo, 'public/art'));
  return hashes;
}

for (const [label, model, expectedModel] of [
  ['default Sunburst', undefined, 'gpt-image-2.5-sunburst'],
  ['Flare override', 'gpt-image-2.5-flare', 'gpt-image-2.5-flare'],
  ['legacy model override', 'gpt-image-1.5', 'gpt-image-1.5'],
]) {
test(`the forest authoring entrypoint wires ${label} and voice providers without external requests or writes`, { timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pointlesh-provider-wiring-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const preload = join(directory, 'offline.mjs');
  await writeFile(preload, `
    import process from 'node:process';
    import http from 'node:http';
    import net from 'node:net';
    import { syncBuiltinESMExports } from 'node:module';
    // Exercise the entrypoint's dotenv call without opening the developer's file.
    process.loadEnvFile = path => process.send({ type: 'env-file', path });
    syncBuiltinESMExports();
    // Even a future provider that bypasses fetch cannot open an outbound socket.
    net.Socket.prototype.connect = function () {
      process.send({ type: 'unexpected-network' });
      throw new Error('Outbound sockets are disabled in this test');
    };
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      const requestedPort = args[0];
      if (typeof requestedPort !== 'number') throw new Error('Expected a numeric authoring port');
      args[0] = 0;
      this.once('listening', () => process.send({ type: 'listening', requestedPort, port: this.address().port }));
      return listen.apply(this, args);
    };
    globalThis.fetch = async (url, init = {}) => {
      process.send({ type: 'provider', url: String(url), method: init.method,
        headers: Object.fromEntries(new Headers(init.headers)), body: JSON.parse(init.body) });
      throw new Error('${sentinel}');
    };
  `);
  const before = await authoringFingerprint();
  const child = fork(join(demo, 'dev-server.mjs'), [], {
    execArgv: ['--import', preload],
    // Deliberately do not inherit the parent environment or any real credentials.
    env: { OPENAI_API_KEY: 'pointlesh-dummy-openai', ELEVENLABS_API_KEY: 'pointlesh-dummy-elevenlabs', ...(model ? { OPENAI_IMAGE_MODEL: model } : {}), ELEVENLABS_OUTPUT_FORMAT: 'mp3_22050_32' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout.resume(); child.stderr.resume();
  const messages = [];
  child.on('message', message => messages.push(message));
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 2000);
      try { await exited; } finally { clearTimeout(force); }
    }
  });
  function messageWhere(predicate) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Timed out waiting for offline authoring child')), 5000);
      const onMessage = message => { if (predicate(message)) finish(undefined, message); };
      const onExit = () => finish(new Error('Offline authoring child exited before verification'));
      const finish = (error, message) => {
        clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError);
        if (error) reject(error); else resolve(message);
      };
      const onError = error => finish(error);
      child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
    });
  }
  assert.equal((await messageWhere(message => message.type === 'env-file')).path, join(demo, '.env'));
  const listeners = await Promise.all([4287, 4288, 4289].map(port => messageWhere(message => message.type === 'listening' && message.requestedPort === port)));
  assert.equal(new Set(listeners.map(listener => listener.port)).size, 3);
  const address = `http://127.0.0.1:${listeners[0].port}`;
  for (const assetId of ['background.forest-wide', 'voice.borin']) {
    const response = await fetch(`${address}/__ai-assets/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, count: 1, prompt: 'Offline provider wiring probe', styleGuide: { prompt: '', images: [] } }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, sentinel, `${assetId} must reach the configured provider before stopping`);
  }
  const image = await messageWhere(message => message.type === 'provider' && message.url === 'https://api.openai.com/v1/images/generations');
  assert.equal(image.method, 'POST');
  assert.equal(image.headers.authorization, 'Bearer pointlesh-dummy-openai');
  assert.equal(image.body.model, expectedModel);
  const voice = await messageWhere(message => message.type === 'provider' && message.url.startsWith('https://api.elevenlabs.io/v1/text-to-voice/design'));
  assert.equal(voice.method, 'POST');
  assert.equal(voice.headers['xi-api-key'], 'pointlesh-dummy-elevenlabs');
  assert.equal(new URL(voice.url).searchParams.get('output_format'), 'mp3_22050_32');
  assert.equal(voice.body.voice_description, 'Offline provider wiring probe');
  assert.equal(messages.filter(message => message.type === 'provider').length, 2);
  assert.equal(messages.some(message => message.type === 'unexpected-network'), false);
  assert.deepEqual(await authoringFingerprint(), before);
});
}
