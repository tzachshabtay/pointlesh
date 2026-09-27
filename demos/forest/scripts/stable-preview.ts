import type { Plugin } from 'vite';

/** The game/designer adopts authoring changes itself; source reloads must be explicit. */
export function stablePreview(): Plugin {
  return {
    name: 'pointlesh-stable-preview',
    apply: 'serve',
    enforce: 'post',
    config: () => ({ server: { hmr: false, ws: false } }),
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
