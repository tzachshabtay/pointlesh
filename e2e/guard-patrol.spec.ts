import { test, expect } from '@playwright/test';

test('guard patrol animates its full loop, restores mid-walk, and sleeps only after drinking', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.story.introStep = 4; scene.renderCutscene(); scene.changeRoom('camp');
    (window as any).guardVisits = [];
    scene.events.on('postupdate', () => {
      const patrol = scene.guardPatrol, npc = scene.npcActors.get('camp.npc.guard');
      const visits = (window as any).guardVisits;
      if (!patrol || visits.at(-1)?.phase === patrol.phase) return;
      visits.push({ phase: patrol.phase, x: npc.sprite.x, y: npc.sprite.y, flip: npc.sprite.flipX,
        texture: npc.sprite.texture.key, frame: npc.sprite.frame.name, elapsed: patrol.elapsedMs });
    });
  });
  await expect(page.locator('#guard-status')).toHaveCount(0);
  const phase = () => page.evaluate(() => (window as any).pointleshDemo.scene.guardPatrol.phase);
  await expect.poll(phase, { timeout: 20000, intervals: [50] }).toBe('idle-back');
  await page.screenshot({ path: testInfo.outputPath('back-idle.png') });
  await expect.poll(phase, { timeout: 15000, intervals: [50] }).toBe('walk-left');
  await page.waitForTimeout(400);
  const restored = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const saved = scene.snapshot(), before = scene.guardPatrol.snapshot();
    scene.restore(saved);
    return { before, after: scene.guardPatrol.snapshot() };
  });
  expect(restored.after).toEqual(restored.before);
  await expect.poll(phase, { timeout: 20000, intervals: [50] }).toBe('drink');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('drink.png') });
  await expect.poll(() => page.evaluate(() => (window as any).guardVisits.filter((v: any) => v.phase === 'idle-front').length), { timeout: 20000 }).toBe(2);
  const visits = await page.evaluate(() => (window as any).guardVisits);
  expect(visits.map((v: any) => v.phase)).toEqual(['idle-front', 'face-back', 'idle-back', 'face-left', 'walk-left', 'drink', 'face-right', 'walk-right', 'face-front', 'idle-front']);
  expect(visits.find((v: any) => v.phase === 'drink').x).toBeLessThan(visits[0].x - 150);
  expect(visits.find((v: any) => v.phase === 'walk-right').flip).toBe(true);
  expect(Math.abs(visits.at(-1).x - visits[0].x)).toBeLessThan(1);
  expect(visits.find((v: any) => v.phase === 'face-right').frame).toBe(7);
  const conversation = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const before = scene.guardPatrol.snapshot();
    scene.applyInteraction('guard');
    scene.update(0, 50);
    const during = scene.guardPatrol.snapshot();
    scene.dismissSpeech(); scene.update(0, 0);
    return { before, during, after: scene.guardPatrol.snapshot() };
  });
  expect(conversation.during).toEqual(conversation.before);
  expect(conversation.after).toEqual(conversation.before);
  // The normal interaction must dose the stew first; completion of the visible
  // drinking clip is the only event allowed to change the puzzle to asleep.
  await expect.poll(phase, { timeout: 20000, intervals: [50] }).toBe('idle-back');
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    scene.story.inventory = ['sleepyStout']; scene.applyInteraction('cauldron', 'sleepyStout'); scene.dismissSpeech();
  });
  expect(await page.evaluate(() => Boolean((window as any).pointleshDemo.scene.story.flags.guardAsleep))).toBe(false);
  await expect.poll(phase, { timeout: 25000 }).toBe('asleep');
  expect(await page.evaluate(() => Boolean((window as any).pointleshDemo.scene.story.flags.guardAsleep))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('sleep.png') });
  expect(errors).toEqual([]);
});
