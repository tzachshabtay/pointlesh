import { createServer } from 'node:http';
import { assertManifest, type AiAssetManifest } from '@ai-game-assets/core';
import { assertInteractionManifest, interactionTargets, syncInteractionVoiceLines, type InteractionManifest } from '@pointlesh/core';
import { assertSceneManifest, type SceneDesignerManifest } from '@scene-designer/core';
import { readProjectJson, writeProjectJson } from './index.js';

export type InteractionDevServerOptions = { manifestPath: string; aiAssetsManifestPath: string; scenesManifestPath?: string; port?: number; host?: string };

/** Promotes interaction data and merges its voice lines into the latest on-disk asset manifest. */
export function createInteractionDevServer(options: InteractionDevServerOptions) {
  const host = options.host ?? '127.0.0.1', port = options.port ?? 4290;
  let queue = Promise.resolve();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin) {
      let allowed = false;
      try { const url = new URL(origin); allowed = ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch {}
      if (!allowed) { response.writeHead(403); response.end('Local authoring origins only'); return; }
      response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
    }
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (request.url !== '/manifest' || !['GET', 'PUT'].includes(request.method ?? '')) { response.writeHead(404); response.end('Not found'); return; }
    try {
      let result: InteractionManifest;
      if (request.method === 'GET') result = await readProjectJson<InteractionManifest>(options.manifestPath, assertInteractionManifest);
      else {
        if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Expected application/json');
        let size = 0; const chunks: Buffer[] = [];
        for await (const chunk of request) { size += chunk.length; if (size > 2_000_000) throw new Error('Interaction manifest is too large'); chunks.push(Buffer.from(chunk)); }
        const manifest: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); assertInteractionManifest(manifest);
        const operation = queue.then(async () => {
          const current = await readProjectJson<AiAssetManifest>(options.aiAssetsManifestPath, value => assertManifest(value as AiAssetManifest));
          const targets = options.scenesManifestPath ? interactionTargets(await readProjectJson<SceneDesignerManifest>(options.scenesManifestPath, value => assertSceneManifest(value as SceneDesignerManifest))) : [];
          const assets = syncInteractionVoiceLines(manifest, current, targets); assertManifest(assets);
          // Extra voice records are harmless if the second write fails; existing generations stay intact.
          await writeProjectJson(options.aiAssetsManifestPath, assets, value => assertManifest(value as AiAssetManifest));
          await writeProjectJson(options.manifestPath, manifest, assertInteractionManifest);
        });
        queue = operation.catch(() => {}); await operation; result = manifest;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
    } catch (error) { response.writeHead(400, { 'Content-Type': 'text/plain' }); response.end(error instanceof Error ? error.message : String(error)); }
  });
  return { server, listen: () => new Promise<{ host: string; port: number }>((resolve, reject) => {
    server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); const address = server.address(); resolve({ host, port: typeof address === 'object' && address ? address.port : port }); });
  }), close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
