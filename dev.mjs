import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const children = [
  { name: 'authoring API', child: spawn(process.execPath, [resolve(root, 'demos/forest/dev-server.mjs')], { cwd: root, stdio: 'inherit' }) },
  { name: 'game preview', child: spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5186', '--strictPort'],
    { cwd: resolve(root, 'demos/forest'), stdio: 'inherit' }) },
];

let stopping = false;
let remaining = children.length;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const { child } of children) if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
}
for (const { name, child } of children) {
  child.on('error', error => { console.error(`${name} failed to start: ${error.message}`); stop(1); });
  child.on('exit', (code, signal) => {
    remaining--;
    if (!stopping) {
      console.error(`${name} stopped (${signal ?? `exit ${code}`}); stopping local preview.`);
      stop(code || 1);
    }
    if (!remaining) process.exit(process.exitCode ?? 0);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop());
