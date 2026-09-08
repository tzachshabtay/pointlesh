import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { createPointleshDevServer, createOpenAiImageProvider, createElevenLabsAudioProvider } from '@pointlesh/dev';

const root = fileURLToPath(new URL('.', import.meta.url));
try { loadEnvFile(resolve(root, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const authoring = resolve(root, 'public/authoring');
const server = createPointleshDevServer({
  assets: {
    manifestPath: resolve(authoring, 'assets.json'), assetsDir: resolve(root, 'public/art'), publicPathPrefix: 'art', port: 4287,
    provider: createOpenAiImageProvider({ model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2' }),
    audioProvider: createElevenLabsAudioProvider({ outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT }),
  },
  scenes: { manifestPath: resolve(authoring, 'scenes.json'), port: 4288 },
  dialogs: { manifestPath: resolve(authoring, 'dialogs.json'), aiAssetsManifestPath: resolve(authoring, 'assets.json'), port: 4289 }
});
await server.listen();
console.log('Pointlesh authoring ready: AI Assets :4287 · Scenes :4288 · Dialogs :4289');
console.log('Promoted manifests are saved in demos/forest/public/authoring and loaded on refresh.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void server.close().then(() => process.exit(0)));
