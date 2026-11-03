import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertJSON } from '@pointlesh/core';
import { createSceneDesignerDevServer, type SceneDesignerDevServerOptions } from '@scene-designer/dev';
import { createDialogDesignerDevServer, type DialogDesignerDevServerOptions } from '@dialog-designer/dev';
import { createAiAssetDevServer, type AiAssetDevServerOptions } from '@ai-game-assets/dev';
import type { Server } from 'node:http';
import { createInteractionDevServer, type InteractionDevServerOptions } from './interactions.js';
export { createInteractionDevServer } from './interactions.js';
export type { InteractionDevServerOptions } from './interactions.js';

export { createSceneDesignerDevServer, createDialogDesignerDevServer, createAiAssetDevServer };
export { createOpenAiImageProvider, createElevenLabsAudioProvider } from '@ai-game-assets/dev';
export { buildSceneManifestModule } from '@scene-designer/dev';
export { buildDialogManifestModule } from '@dialog-designer/dev';

/** Validate first; rename a sibling temporary file so failed writes preserve the previous file. */
export async function writeProjectJson<T>(path: string, data: T, validate: (value: unknown) => void): Promise<void> {
  assertJSON(data);
  validate(data);
  const serialized = JSON.stringify(data, null, 2) + '\n';
  validate(JSON.parse(serialized));
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serialized, { flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export async function readProjectJson<T>(path: string, validate: (value: unknown) => void): Promise<T> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  validate(value);
  return value as T;
}

export type PointleshDevOptions = {
  scenes: SceneDesignerDevServerOptions;
  dialogs: DialogDesignerDevServerOptions;
  assets: AiAssetDevServerOptions;
  interactions?: InteractionDevServerOptions;
};

/** Keep the local authoring APIs inaccessible to pages from public sites. */
function restrictAuthoringOrigin(server: Server) {
  const handlers = server.listeners('request');
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    const origin = request.headers.origin;
    let allowed = !origin && request.headers['sec-fetch-site'] !== 'cross-site';
    if (origin) {
      try {
        const url = new URL(origin);
        allowed = ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      } catch { allowed = false; }
    }
    if (!allowed) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Local authoring origins only');
      return;
    }
    for (const handler of handlers) handler.call(server, request, response);
  });
}

/** A single lifecycle for the native authoring services and optional interaction editor. */
export function createPointleshDevServer(options: PointleshDevOptions) {
  const services = [createAiAssetDevServer(options.assets), createSceneDesignerDevServer(options.scenes), createDialogDesignerDevServer(options.dialogs)];
  if (options.interactions) services.push(createInteractionDevServer({ scenesManifestPath: options.scenes.manifestPath, ...options.interactions }));
  for (const service of services) restrictAuthoringOrigin(service.server);
  return {
    services,
    async listen() {
      const started: typeof services = [];
      const addresses: {host:string;port:number}[] = [];
      try {
        for (const service of services) {
          // Older upstream listen wrappers do not reject on an occupied port.
          const address = await new Promise<{host:string;port:number}>((resolve, reject) => {
            const fail = (error: Error) => reject(error);
            service.server.once('error', fail);
            service.listen().then(value => {
              service.server.off('error', fail);
              const bound = service.server.address();
              resolve(bound && typeof bound !== 'string' ? { host: value.host, port: bound.port } : value);
            }, error => { service.server.off('error', fail); reject(error); });
          });
          started.push(service); addresses.push(address);
        }
        return addresses;
      } catch (error) { await Promise.allSettled(started.map(service => service.close())); throw error; }
    },
    async close() { await Promise.all(services.filter(service => service.server.listening).map(service => service.close())); }
  };
}
