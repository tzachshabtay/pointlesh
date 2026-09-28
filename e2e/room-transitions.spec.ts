import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('all room connections walk out and in with temporary corridors, animated doors, and restorable progress', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { forestPortal } = await import('/src/transition-content.ts' as string);
    const scene = (window as any).pointleshDemo.scene, manifest = (window as any).pointleshDemo.manifest;
    scene.game.loop.sleep();
    const connections = [['village','pub','pub-door'],['pub','village','pub-exit'],['village','house','home-door'],['house','village','house-exit'],
      ['village','forest','forest-path'],['forest','village','forest-exit'],['forest','mine','mine-path'],['mine','forest','mine-exit'],['forest','camp','camp-path'],['camp','forest','camp-exit']];
    const results = [];
    for (const [from, to, target] of connections) {
      scene.changeRoom(from); scene.character.place(forestPortal(manifest, from, to).path[0]); scene.binding.sync();
      scene.applyInteraction(target);
      const phases = new Set<string>(), frames = new Set<number>(), checkpoints = new Set<string>();
      const faded = new Set<string>();
      let sourceLast: any, destinationFirst: any;
      for (let i = 0; i < 1500 && scene.roomTransition.active; i++) {
        const phase = scene.roomTransition.phase; phases.add(phase);
        const portal = scene.roomTransition.portal;
        if (portal.doorId) frames.add(scene.entitySprites.get(portal.doorId).frame.name);
        if (!checkpoints.has(phase)) {
          const saved = scene.snapshot(); scene.restore(saved);
          if (JSON.stringify(scene.snapshot()) !== JSON.stringify(saved)) throw new Error(`Changed checkpoint ${from}/${phase}`);
          checkpoints.add(phase);
        }
        if (portal.fadeOnLastSegment) {
          const position = scene.character.state.position, alpha = scene.actor.alpha;
          if (alpha !== scene.roomTransition.characterOpacity) throw new Error(`Wrong rendered opacity ${from}/${phase}`);
          if (phase === 'open-entry' || phase === 'close-exit') {
            if (alpha !== 0) throw new Error(`Visible behind a closing/closed door ${from}/${phase}`);
          }
          if (position.y < Math.min(...portal.path.map((p: any) => p.y)) - 1e-6) throw new Error(`Walking above doorway floor ${from}/${phase}`);
          if (alpha > 0 && alpha < 1) {
            faded.add(phase);
            const [inside, threshold] = portal.path;
            const cross = (position.x - threshold.x) * (threshold.y - inside.y) - (position.y - threshold.y) * (threshold.x - inside.x);
            if (Math.abs(cross) > 1e-5) throw new Error(`Turned away from approach line ${from}/${phase}`);
          }
        }
        const oldRoom = scene.story.roomId, oldPosition = { ...scene.character.state.position };
        scene.update(0, 50);
        if (oldRoom !== scene.story.roomId) { sourceLast = oldPosition; destinationFirst = { ...scene.character.state.position }; }
      }
      results.push({ from, to, active: scene.roomTransition.active, room: scene.story.roomId, phases: [...phases], frames: [...frames], faded: [...faded], alpha: scene.actor.alpha, sourceLast, destinationFirst,
        position: { ...scene.character.state.position }, expected: forestPortal(manifest, to, from).path[0],
        enabled: scene.resolved().areas.filter((area: any) => area.id.includes('.transition.') && area.enabled).length });
    }
    // Leave a doorway open mid-exit for a screenshot of real room artwork.
    scene.changeRoom('village'); scene.character.place(forestPortal(manifest, 'village', 'house').path[0]); scene.applyInteraction('home-door');
    for (let i = 0; i < 350; i++) { scene.update(0,50); if (scene.roomTransition.phase === 'exit' && scene.character.state.position.y < 390) break; }
    scene.scene.pause(); scene.game.loop.wake();
    return results;
  });
  for (const route of result) {
    expect(route, `${route.from} → ${route.to}`).toMatchObject({ active: false, room: route.to, enabled: 0, position: route.expected, alpha: 1 });
    expect(route.phases).toEqual(['open-exit','exit','close-exit','open-entry','entry','close-entry']);
    expect(route.sourceLast).toBeTruthy(); expect(route.destinationFirst).toBeTruthy();
    if (route.frames.length) expect(route.frames.length).toBeGreaterThan(3);
    if (![route.from, route.to].every(room => ['village', 'forest'].includes(room))) expect(route.faded).toEqual(['exit', 'entry']);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('cottage-door-exit.png') });
});

test('the king keeps continuous perspective as he crosses into the cage', async ({ page }) => {
  await openAdventure(page);
  const scales = await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene; scene.game.loop.sleep();
    scene.story.introStep = 2; scene.introRunner.restore({ cutsceneId: 'forest.intro', version: 1, stepIndex: 2, elapsedMs: 0 }); scene.renderCutscene();
    const result = [];
    for (let elapsed = 0; elapsed <= 4500; elapsed += 20) {
      scene.cinematic.render(2, elapsed);
      const king = scene.children.getByName('pointlesh-cinematic').list[0].getByName('cinematic-king');
      result.push({ y: king.y, height: king.displayHeight });
    }
    return result;
  });
  expect(scales[0].y).toBeGreaterThan(355); expect(scales.at(-1)!.y).toBeLessThan(355);
  for (let i = 1; i < scales.length; i++) expect(Math.abs(scales[i].height - scales[i-1].height)).toBeLessThan(1);
});
