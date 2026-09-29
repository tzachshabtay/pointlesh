import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { pointInPolygon } from '@pointlesh/core';
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
      const ordered = new Set<string>();
      const cottagePositions: { x: number; y: number }[] = [];
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
        if (scene.actor.alpha !== 1) throw new Error(`Character opacity changed ${from}/${phase}`);
        if (scene.story.roomId === 'house' && (phase === 'exit' || phase === 'entry')) cottagePositions.push({ ...scene.character.state.position });
        if (portal.doorId) {
          const foreground = scene.doorForegrounds.get(portal.doorId);
          const frame = scene.resolved().areas.find((area: any) => area.id === `${portal.doorId}.frame`);
          if (!foreground || foreground.image.depth !== frame.properties.baseline) throw new Error(`Wrong door baseline ${from}/${phase}`);
          if (scene.actor.depth > foreground.image.depth) ordered.add('front');
          else ordered.add('behind');
        }
        const oldRoom = scene.story.roomId, oldPosition = { ...scene.character.state.position };
        scene.update(0, 50);
        if (oldRoom !== scene.story.roomId) { sourceLast = oldPosition; destinationFirst = { ...scene.character.state.position }; }
      }
      results.push({ from, to, active: scene.roomTransition.active, room: scene.story.roomId, phases: [...phases], frames: [...frames], ordered: [...ordered], alpha: scene.actor.alpha, sourceLast, destinationFirst, cottagePositions,
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
    const root = [[1060,554],[1079,522],[1098,490],[1114,464],[1140,428],[1163,393],[1182,399],[1182,575],[1100,568]]
      .map(([x, y]) => ({ x: x * 960 / 1182, y: y * 540 / 664 }));
    for (const position of route.cottagePositions) expect(pointInPolygon(position, root), `${route.from} → ${route.to}: boots on the tree root at ${JSON.stringify(position)}`).toBe(false);
    if (route.from === 'house' || route.to === 'house') {
      expect(route.cottagePositions.some(p => p.y > 390 && p.y < 410 && p.x > 790 && p.x < 840), 'cross the lower stair treads in each direction').toBe(true);
    }
    if (route.frames.length) {
      expect(route.frames.length).toBeGreaterThan(3);
      expect(route.ordered.sort(), `${route.from} → ${route.to}: crosses the doorway baseline`).toEqual(['behind', 'front']);
    }
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

test('door pixels occlude actors behind the sill while the open passage stays behind them', async ({ page }, testInfo) => {
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.evaluate(async () => {
    const { forestPortal } = await import('/src/transition-content.ts' as string);
    const api = (window as any).pointleshDemo, scene = api.scene;
    scene.game.loop.sleep(); scene.changeRoom('house');
    const from = forestPortal(api.manifest, 'house', 'village'), to = forestPortal(api.manifest, 'village', 'house');
    scene.roomTransition.restore({ from, to, phase: 'close-exit', elapsedMs: 450, waypoint: 0 });
    scene.character.place(from.path.at(-1)); scene.binding.sync(); scene.syncTransitionDoors();
    const foreground = scene.doorForegrounds.get(from.doorId), bounds = foreground.image.getBounds();
    // A solid actor silhouette makes pixel coverage independent of character art.
    scene.actor.setVisible(false);
    scene.add.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0xff00ff)
      .setOrigin(0).setDepth(foreground.image.depth - 1).setName('occlusion-probe');
    scene.scene.pause(); scene.game.loop.wake();
  });
  const capture = async (name: string) => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bytes = await page.locator('#game canvas').screenshot({ path: testInfo.outputPath(`${name}.png`) });
    const png = PNG.sync.read(bytes);
    let pixels = 0;
    for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 240 && png.data[i + 1] < 15 && png.data[i + 2] > 240) pixels++;
    return pixels;
  };
  const behind = await capture('behind-door');
  await page.evaluate(() => (window as any).pointleshDemo.scene.doorForegrounds.get('house.door.house').image.setVisible(false));
  const passage = await capture('passage-without-leaf');
  await page.evaluate(() => {
    const scene = (window as any).pointleshDemo.scene;
    const foreground = scene.doorForegrounds.get('house.door.house').image;
    foreground.setVisible(true); scene.children.getByName('occlusion-probe').setDepth(foreground.depth + 1);
  });
  const front = await capture('in-front-of-door');
  expect(behind).toBeGreaterThan(100); // The backdrop cannot hide the entire actor.
  expect(passage - behind).toBeGreaterThan(100); // Only the leaf removes coverage.
  expect(front).toBeGreaterThan(passage); // Walking forward clears both leaf and frame.
});

test('thin door-mask pieces remain opaque at every camera zoom', async ({ page }, testInfo) => {
  await openAdventure(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  for (const room of ['village', 'house']) for (const zoom of [0.6, 1, 1.4]) {
    const view = await page.evaluate(async ({ room, zoom }) => {
      const { forestPortal } = await import('/src/transition-content.ts' as string);
      const { forestDoors, doorWorldAperture } = await import('/src/door-layout.ts' as string);
      const api = (window as any).pointleshDemo, scene = api.scene;
      scene.game.loop.sleep(); scene.scene.resume(); scene.changeRoom(room);
      scene.children.getByName('occlusion-probe')?.destroy();
      const other = room === 'village' ? 'house' : 'village';
      const to = forestPortal(api.manifest, room, other), from = forestPortal(api.manifest, other, room);
      scene.roomTransition.restore({ from, to, phase: 'open-entry', elapsedMs: 0, waypoint: 0 });
      scene.character.place(to.path.at(-1)); scene.binding.sync(); scene.syncTransitionDoors();
      const foreground = scene.doorForegrounds.get(to.doorId), bounds = foreground.image.getBounds();
      scene.actor.setVisible(false);
      scene.add.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0xff00ff)
        .setOrigin(0).setDepth(foreground.image.depth - 1).setName('occlusion-probe');
      const camera = scene.cameras.main;
      camera.setZoom(zoom).centerOn(bounds.centerX, bounds.centerY);
      const aperture = doorWorldAperture(forestDoors.find((door: any) => door.room === room && door.to === other)!);
      const polygon = aperture.map((point: any) => ({
        x: (point.x - camera.scrollX - camera.width / 2) * zoom + camera.width / 2,
        y: (point.y - camera.scrollY - camera.height / 2) * zoom + camera.height / 2,
      }));
      scene.scene.pause(); scene.game.loop.wake();
      return { doorId: to.doorId, polygon, width: camera.width };
    }, { room, zoom });
    const leakingPixels = async (label: string) => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = PNG.sync.read(await page.locator('#game canvas').screenshot({ path: testInfo.outputPath(`${room}-${zoom}-${label}.png`) }));
      const ratio = png.width / view.width;
      const polygon = view.polygon.map(point => ({ x: point.x * ratio, y: point.y * ratio }));
      let count = 0;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const offset = (y * png.width + x) * 4;
        if (png.data[offset] < 240 || png.data[offset + 1] > 15 || png.data[offset + 2] < 240) continue;
        // Ignore the antialiased boundary; the solid interior must have no holes.
        if ([[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]].every(([dx, dy]) => pointInPolygon({ x: x + dx, y: y + dy }, polygon))) count++;
      }
      return count;
    };
    expect(await leakingPixels('masked'), `${room}, zoom ${zoom}: actor pixels through closed wood`).toBe(0);
    await page.evaluate(id => (window as any).pointleshDemo.scene.doorForegrounds.get(id).image.setVisible(false), view.doorId);
    expect(await leakingPixels('unmasked')).toBeGreaterThan(300);
  }
});
