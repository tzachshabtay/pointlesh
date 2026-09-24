import { readFile, writeFile } from 'node:fs/promises';
import { assertManifest } from '@ai-game-assets/core';
import { assertSceneManifest } from '@scene-designer/core';
import { addGuardAnimations } from '../src/guard-assets.js';
import { addForestPoints } from '../src/points.js';

const assetFile = new URL('../public/authoring/assets.json', import.meta.url);
const assets = JSON.parse(await readFile(assetFile, 'utf8'));
addGuardAnimations(assets);
const back = assets.assets['guard.idle-back'];
if (!back.versions['patrol-back-idle']) {
  back.versions['patrol-back-idle'] = { name: 'patrol-back-idle', file: 'art/characters/guard/patrol-idle-back.png',
    prompt: 'The same armored orc seen fully from behind, breathing gently with his boots planted. Transparent background.',
    createdAt: '2026-09-24T00:00:00.000Z', model: 'imagegen', parentVersion: back.activeVersion,
    notes: 'Back-facing poses from the new face-back animation. Earlier promoted idle-back artwork is preserved.' };
  back.activeVersion = 'patrol-back-idle';
  back.prompt = back.versions['patrol-back-idle'].prompt;
  back.dimensions = { width: 120, height: 240 };
  back.frameGrid = { frameWidth: 40, frameHeight: 80, columns: 3, rows: 3, frameCount: 8 };
  back.animations = [{ key: 'guard.idle-back', frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 2, repeat: -1 }];
}
assertManifest(assets);
await writeFile(assetFile, JSON.stringify(assets, null, 2) + '\n');
const sceneFile = new URL('../public/authoring/scenes.json', import.meta.url);
const scenes = addForestPoints(JSON.parse(await readFile(sceneFile, 'utf8')));
assertSceneManifest(scenes);
await writeFile(sceneFile, JSON.stringify(scenes, null, 2) + '\n');
console.log('Registered guard turn/drink clips, matching back idle, and two editable patrol points.');
