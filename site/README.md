# Pointlesh website

`public/` contains the static showcase published at the project Pages root. The playable game lives at `/demo/` in the Pages artifact. From the repository root, build the demo and assemble both routes with:

```sh
npm run build:pages --workspace pointlesh-forest-demo
npm run build:site
npm run test:site
```

The homepage centers on the in-game authoring loop. Its three interactive storyboards use captures of the real scene, asset and interaction designers over the running forest demo. The walkable-area frames show a local draft edit; they do not modify the promoted game. Keep the captures and feature descriptions in sync with the demo when its tools change.
