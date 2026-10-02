import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openAdventure } from './start-helpers';

for (const restored of [false, true]) test(`the unpaused ${restored ? 'restored' : 'new'} intro retains rendered cast placement after gameplay resumes`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1910, height: 1074 });
  await openAdventure(page);
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const proof = { before: null, after: null } as any;
    (window as any).introLiveProof = proof;
    let resumedAt: number | undefined;
    const frame = (cinematic: boolean) => {
      const world = scene.children.getByName('pointlesh-cinematic')?.list[0];
      const elder = [...scene.npcActors.values()].find((npc: any) => npc.actorName === 'elder') as any;
      const camera = scene.cameras.main;
      const sprites = cinematic ? ['borin', 'elder'].map(id => world.getByName('cinematic-' + id)) : [scene.actor, elder.sprite];
      return { image: scene.game.canvas.toDataURL(), zoom: camera.zoom, scroll: [camera.scrollX, camera.scrollY],
        cast: sprites.map((sprite: any) => {
          const matrix = sprite.getWorldTransformMatrix();
          return { x: sprite.x, y: sprite.y, sx: cinematic ? matrix.tx : 480*(1-camera.zoom)-camera.scrollX*camera.zoom+sprite.x*camera.zoom,
            sy: cinematic ? matrix.ty : 270*(1-camera.zoom)-camera.scrollY*camera.zoom+sprite.y*camera.zoom,
            width: sprite.displayWidth * (cinematic ? world.scaleX : camera.zoom),
            height: sprite.displayHeight * (cinematic ? world.scaleY : camera.zoom),
            animation: sprite.anims.currentAnim?.key, origin: [sprite.originX,sprite.originY] };
        }) };
    };
    const capture = () => {
      if (scene.story.introStep === 3 && scene.introRunner.snapshot().elapsedMs > 8000) proof.before = frame(true);
      if (proof.before && scene.story.introStep === 4 && !scene.cutsceneCrossfade && !scene.cinematic) {
        resumedAt ??= performance.now();
        // Keep gameplay running after the overlay disappears, so a later
        // controller or camera update cannot silently undo the handoff.
        if (performance.now() - resumedAt < 750) return;
        proof.after = frame(false); scene.game.events.off('postrender', capture);
      }
    };
    scene.game.events.on('postrender', capture);
  });
  if (restored) await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene, checkpoint = scene.snapshot();
    // A checkpoint created before editing the scene still has its older player
    // position. The visible cinematic must own the handoff, not that old pose.
    checkpoint.characters.borin.position = { x: 620, y: 475 };
    checkpoint.cutscene.introStep = 3; checkpoint.cutscene.introElapsedMs = 7800;
    scene.restore(checkpoint);
  });
  else for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next scene' }).click();
  await page.waitForFunction(() => (window as any).introLiveProof.after, undefined, { timeout: 25000 });
  const proof = await page.evaluate(() => (window as any).introLiveProof);
  for (const key of ['before', 'after']) {
    await writeFile(testInfo.outputPath(key + '.png'), Buffer.from(proof[key].image.split(',')[1], 'base64'));
    await testInfo.attach(key, { path: testInfo.outputPath(key + '.png'), contentType: 'image/png' });
    delete proof[key].image;
  }
  await writeFile(testInfo.outputPath('poses.json'), JSON.stringify(proof, null, 2));
  for (let i = 0; i < 2; i++) for (const key of ['x', 'y', 'sx', 'sy', 'width', 'height']) {
    expect(proof.after.cast[i][key], `${i === 0 ? 'Borin' : 'Rowan'} ${key}`).toBeCloseTo(proof.before.cast[i][key], 3);
  }
});
