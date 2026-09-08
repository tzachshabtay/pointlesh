# @pointlesh/dev

Local authoring services and project JSON persistence for Pointlesh. This package composes the established AI Assets, Scene Designer and Dialog Designer development servers; it does not create a fourth competing manifest format.

## CLI

After building the workspace, run:

```sh
pointlesh-dev serve --project=./authoring --assets-dir=./public/art --port=4287
```

The project directory supplies `assets.json`, `scenes.json` and `dialogs.json`. AI Assets uses the supplied assets directory. Ports are consecutive: AI Assets on 4287, Scene Designer on 4288 and Dialog Designer on 4289. Set a different starting port with `--port`; accepted values are 1024–65533. `SIGINT` and `SIGTERM` close all three services.

For the included demo, use `npm run dev:server` at repository root. Start `npm run dev` separately to serve the game at `http://127.0.0.1:5186`. These services support local promotion and asset authoring; the built demo can be hosted as static files without them.

## Programmatic lifecycle

```ts
import { createPointleshDevServer, createOpenAiImageProvider, createElevenLabsAudioProvider } from '@pointlesh/dev';

const tools = createPointleshDevServer({
  assets: {
    manifestPath: './authoring/assets.json',
    assetsDir: './public/art', port: 4287,
    provider: createOpenAiImageProvider(),
    audioProvider: createElevenLabsAudioProvider(),
  },
  scenes: { manifestPath: './authoring/scenes.json', port: 4288 },
  dialogs: {
    manifestPath: './authoring/dialogs.json',
    aiAssetsManifestPath: './authoring/assets.json', port: 4289,
  },
});
await tools.listen();
// On shutdown:
await tools.close();
```

Options are the upstream `AiAssetDevServerOptions`, `SceneDesignerDevServerOptions` and `DialogDesignerDevServerOptions`. The returned `services` array exposes those individual services. Startup is sequential; if a later service fails, already-started services are closed. Errors such as occupied ports propagate to the caller.

The provider factories read `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` from the server's environment, or accept an explicit `apiKey` option. Load your local environment before creating the services. The forest demo's entrypoint loads its optional `demos/forest/.env` automatically; shell variables take precedence.

Individual `createAiAssetDevServer`, `createSceneDesignerDevServer`, `createDialogDesignerDevServer`, `buildSceneManifestModule` and `buildDialogManifestModule` helpers are also re-exported. Provider configuration, asset generation, upstream promotion endpoints and manifest-module behavior follow those libraries.

## Validated JSON files

```ts
import { writeProjectJson, readProjectJson } from '@pointlesh/dev';
import { assertSceneManifest, type SceneDesignerManifest } from '@scene-designer/core';

await writeProjectJson('./authoring/scenes.json', sceneManifest, assertSceneManifest);
const scenes = await readProjectJson<SceneDesignerManifest>(
  './authoring/scenes.json', assertSceneManifest,
);
```

`writeProjectJson` validates both the input and its JSON round-trip before writing, creates parent directories, writes a sibling temporary file, and renames it into place. Validation/write failures leave the previous file intact and temporary files are cleaned up. `readProjectJson` parses and validates before returning data. These utilities manage authoring documents; saved-game slots belong to the core `SaveStore`.

Source writeback belongs on the developer's local machine. Do not expose development servers as the public game's backend. A hosted preview can edit in memory and export JSON, but it cannot promote into the host repository without a separately configured authoring environment.
