import type { Plugin } from 'vite';
import { join } from 'node:path';
import sirv from 'sirv';

/** The game/designer adopts authoring changes itself; source reloads must be explicit. */
export function stablePreview(): Plugin {
  return {
    name: 'pointlesh-stable-preview',
    apply: 'serve',
    enforce: 'post',
    config: () => ({ server: { hmr: false, ws: false } }),
    configureServer(server) {
      if (!server.config.publicDir) return;
      // The companion authoring server writes new media while Vite is running.
      // Vite's public-file index waits for a watcher event; before that event,
      // a request for the new MP3/PNG falls through to index.html with HTTP 200.
      // Resolve authored media from disk on each request instead.
      const serve = sirv(join(server.config.publicDir, 'art'), {
        dev: true, etag: true, extensions: [],
        onNoMatch(_request, response) {
          response.statusCode = 404;
          response.setHeader('Content-Type', 'text/plain');
          response.end('Asset not found');
        },
      });
      server.middlewares.use(`${server.config.base}art`, (request, response) => serve(request, response));
    },
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/vite/dist/client/client.mjs')) return;
      // Vite 7's hmr:false disables updates but its client still connects and
      // reloads after a lost socket. Keep its CSS helpers, without that socket.
      const connect = 'transport.connect(createHMRHandler(handleMessage));';
      if (!code.includes(connect)) {
        throw new Error('Vite client changed; review stable-preview before enabling automatic connections.');
      }
      return { code: code.replace(connect, ''), map: null };
    },
  };
}
