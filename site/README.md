# Pointlesh website

`public/` contains the static showcase published at the project Pages root. The playable game lives at `/demo/` in the Pages artifact. From the repository root, build the demo and assemble both routes with:

```sh
npm run build:pages --workspace pointlesh-forest-demo
npm run build:site
npm run test:site
```

The feature images are cropped or resized from the forest demo's own gameplay and designer screenshots. The walking loop uses Borin's promoted eight-frame sprite sheet over the demo's Bramblehollow background. Keep the images and feature descriptions in sync with the demo when its UI changes.
