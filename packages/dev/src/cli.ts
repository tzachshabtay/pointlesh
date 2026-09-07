#!/usr/bin/env node
import { resolve } from 'node:path';
import { createPointleshDevServer } from './index.js';

const [command, ...args] = process.argv.slice(2);
const option = (key: string, fallback: string) => args.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
if (command !== 'serve') {
  console.log('pointlesh-dev serve --project=./authoring --assets-dir=./public/art --port=4287\nStarts AI Assets, Scene Designer, and Dialog Designer on consecutive local ports.');
  process.exit(command === '--help' || !command ? 0 : 1);
}
const project = resolve(option('project', './authoring'));
const port = Number(option('port', '4287'));
if (!Number.isInteger(port) || port < 1024 || port > 65533) throw new Error('Port must be an integer between 1024 and 65533');
const manifestPath = resolve(project, 'assets.json');
const server = createPointleshDevServer({
  assets: { manifestPath, assetsDir: resolve(option('assets-dir', './public/art')), port },
  scenes: { manifestPath: resolve(project, 'scenes.json'), port: port + 1 },
  dialogs: { manifestPath: resolve(project, 'dialogs.json'), aiAssetsManifestPath: manifestPath, port: port + 2 }
});
await server.listen();
console.log(`Pointlesh authoring services ready on http://127.0.0.1:${port} through ${port + 2}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
