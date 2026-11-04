# Pointlesh website

`public/` contains the static showcase published at the project Pages root. The playable game lives at `/demo/` in the Pages artifact. From the repository root, build the demo and assemble both routes with:

```sh
npm run build:pages --workspace pointlesh-forest-demo
npm run build:site
npm run test:site
```

The homepage centers on the in-game authoring loop. A short screen recording shows a walkable area being dragged and tested in the running game; the other interactive storyboards use captures of the asset, interaction, and dialog designers. The walkable-area edit is a local draft and does not modify the promoted game. The public game is play-only, so the site links to local setup instructions for the authoring tools. Keep the media and feature descriptions in sync with the demo when its tools change.
