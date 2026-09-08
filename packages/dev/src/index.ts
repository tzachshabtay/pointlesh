import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertJSON } from '@pointlesh/core';
import { createSceneDesignerDevServer, type SceneDesignerDevServerOptions } from '@scene-designer/dev';
import { createDialogDesignerDevServer, type DialogDesignerDevServerOptions } from '@dialog-designer/dev';
import { createAiAssetDevServer, type AiAssetDevServerOptions } from '@ai-game-assets/dev';

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
};

/** A single lifecycle for all three established authoring services. */
export function createPointleshDevServer(options: PointleshDevOptions) {
  const services = [createAiAssetDevServer(options.assets), createSceneDesignerDevServer(options.scenes), createDialogDesignerDevServer(options.dialogs)];
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
