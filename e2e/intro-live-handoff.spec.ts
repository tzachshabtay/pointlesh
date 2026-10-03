import { expect, test } from '@playwright/test';
import { isWalkable } from '@pointlesh/core';
import { openAdventure } from './start-helpers';

for (const finish of ['natural', 'begin'] as const) test(`camp fades into Borin's normal gameplay entrance (${finish})`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  await page.evaluate(finish => {
    const scene = (window as any).pointleshDemo.scene;
    scene.scene.pause(); scene.story.introStep = 2;
    scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex: 2, elapsedMs: finish === 'natural' ? 5900 : 2500 });
    scene.renderCutscene();
    (window as any).arrivalProof = { samples: [], restored: false, originalActor: scene.actor };
    scene.events.on('postupdate', () => {
      const proof = (window as any).arrivalProof;
      if (scene.introArrival !== 'walking' || scene.cutsceneCrossfade) return;
      proof.samples.push({ position: { ...scene.character.state.position }, floors: scene.walkables(),
        animation: scene.actor.anims.currentAnim?.key, phase: scene.roomTransition.phase,
        door: scene.roomTransition.doorProgress, sameActor: scene.actor === proof.originalActor,
        cinematic: !!scene.cinematic, parent: !!scene.actor.parentContainer });
      if (scene.character.isWalking && !proof.restored) {
        const saved = scene.snapshot(), position = { ...scene.character.state.position };
        scene.restore(saved); proof.restored = true;
        proof.resumeMatches = JSON.stringify(position) === JSON.stringify(scene.character.state.position);
      }
    });
  }, finish);
  await expect(page.locator('#cutscene-location')).toContainText('ORC ENCAMPMENT');
  await page.screenshot({ path: testInfo.outputPath('camp-before-fade.png') });
  if (finish === 'begin') await page.getByRole('button', { name: 'Begin adventure' }).click();
  await page.evaluate(() => (window as any).pointleshDemo.scene.scene.resume());
  await expect(page.locator('#cutscene')).toBeHidden();
  await expect(page.locator('#speech')).toHaveText('An army would wake the whole camp. One dwarf? I will bring him home.');
  await expect(page.locator('#speaker')).toHaveText('Borin');
  const proof = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene, proof = (window as any).arrivalProof;
    const save = scene.snapshot(); scene.restore(save);
    return { samples: proof.samples, resumeMatches: proof.resumeMatches, savedPhase: save.extensions.introArrival,
      restoredPhase: scene.introArrival, position: scene.character.state.position, authored: scene.playerDefinition().position,
      actorStable: scene.actor === proof.originalActor, transition: scene.roomTransition.active, cinematic: !!scene.cinematic };
  });
  expect(proof).toMatchObject({ resumeMatches: true, savedPhase: 'speech', restoredPhase: 'speech', actorStable: true, transition: false, cinematic: false });
  expect(proof.position).toEqual(proof.authored);
  expect(proof.samples.length).toBeGreaterThan(10);
  expect(proof.samples.some(sample => sample.phase === 'opening-entry' && sample.door > 0 && sample.door < 1)).toBe(true);
  expect(proof.samples.some(sample => sample.animation?.startsWith('borin.walk-'))).toBe(true);
  for (const sample of proof.samples) {
    expect(isWalkable(sample.position, sample.floors)).toBe(true);
    expect(sample).toMatchObject({ sameActor: true, cinematic: false, parent: false });
  }
  await page.screenshot({ path: testInfo.outputPath('normal-game-arrival.png') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.blocked())).toBe(false);
  expect(errors).toEqual([]);
});

test('old completed saves stay completed and old cottage shots become normal entrances', async ({ page }) => {
  await openAdventure(page);
  const migrated = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene; scene.scene.pause();
    const saved = scene.snapshot(); delete saved.cutscene.introVersion;
    saved.cutscene.introStep = 4; saved.cutscene.introElapsedMs = 0;
    scene.restore(saved);
    const completed = { introStep: scene.story.introStep, arrival: scene.introArrival ?? null, cinematic: !!scene.cinematic };
    saved.cutscene.introStep = 3; saved.cutscene.introElapsedMs = 5000;
    scene.restore(saved);
    return { completed, arrival: scene.introArrival, phase: scene.roomTransition.phase, cinematic: !!scene.cinematic };
  });
  expect(migrated).toEqual({ completed: { introStep: 3, arrival: null, cinematic: false }, arrival: 'walking', phase: 'opening-entry', cinematic: false });
});
